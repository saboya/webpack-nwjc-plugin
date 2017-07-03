const path = require('path')
const fs = require('fs')
const os = require('os')
const temp = require('temp')
const execFile = require('child_process').execFile
const RawSource = require('webpack-sources/lib/RawSource')

const defaultOPtions = {
  nwjc: path.join(path.dirname(require.resolve('nw')), 'nwjs', 'nwjc'),
  deleteOriginal: false,
  files: [],
  htmlWebpackReplace: true,
}

temp.track()

let script = 'require(\'nw.gui\').Window.get().evalNWBin(null, \'[asset]\');'

function NwjcPlugin (options = {}) {
  this.options = Object.assign(defaultOPtions, options)

  if (this.options.files.length === 0) {
    console.warn('[webpack-nwjc-plugin] No files specified.')
  }

  this.shouldCompileAsset = this.shouldCompileAsset.bind(this)
  this.replaceTags = this.replaceTags.bind(this)
  this.compileFile = this.compileFile.bind(this)
}

NwjcPlugin.prototype.assetName = function (asset) {
  return asset + '.bin'
}

NwjcPlugin.prototype.shouldCompileAsset = function (asset) {
  return this.options.files.includes(asset)
}

NwjcPlugin.prototype.replaceTags = function (tag) {
  if (tag.tagName === 'script' && this.shouldCompileAsset(tag.attributes.src)) {
    tag.innerHTML = script.replace('[asset]', this.assetName(tag.attributes.src))
    delete tag.attributes.src
  }

  return tag
}

NwjcPlugin.prototype.compileFile = function (input, out, callback) {
  execFile(this.options.nwjc, [input, out], { cwd: os.tmpdir() }, (err, stdout) => {
    if (!err) {
      callback(fs.readFileSync(out))
    }
  })
}

NwjcPlugin.prototype.apply = function (compiler) {
  const self = this

  if (this.options.htmlWebpackReplace) {
    compiler.plugin('compilation', function (compilation) {
      compilation.plugin('html-webpack-plugin-alter-asset-tags', function (htmlPluginData, callback) {
        htmlPluginData.head = htmlPluginData.head.map(self.replaceTags)
        htmlPluginData.body = htmlPluginData.body.map(self.replaceTags)

        return callback(null, htmlPluginData)
      })
    })
  }

  compiler.plugin('this-compilation', (compilation) => {
    compilation.plugin('optimize-assets', (assets, callback) => {
      let js = Object.keys(assets).filter(asset => self.shouldCompileAsset(asset))

      js.map(asset => {
        temp.open('nwjc-temp', (err, bundleInfo) => {
          if (!err) {
            fs.write(bundleInfo.fd, assets[asset].source(), err => {
              if (!err) {
                fs.close(bundleInfo.fd, err => {
                  if (err) {
                  } else {
                    temp.open('nwjc-temp', (err, binInfo) => {
                      if (!err) {
                        self.compileFile(bundleInfo.path, binInfo.path, contents => {
                          assets[self.assetName(asset)] = new RawSource(contents)
                          if (self.options.deleteOriginal) {
                            delete assets[asset]
                          }
                          callback()
                        })
                      }
                    })
                  }
                })
              }
            })
          }
        })
      })
      if (js.length === 0) {
        callback()
      }
    })
  })
}

module.exports = NwjcPlugin
