// through2 is a thin wrapper around node transform streams
var through = require('through2');
var gutil = require('gulp-util');
var PluginError = gutil.PluginError;
var path = require('path'),
    extend = require('extend'),
    Soup = require('soup'),
    rewriteCSSURLs = require('css-url-rewriter');

// Consts
const PLUGIN_NAME = 'gulp-cdnify';

function isLocalPath(filePath, mustBeRelative) {
  return (
    typeof filePath === 'string' && filePath.length &&
    (filePath.indexOf('//') === -1) &&
    (filePath.indexOf('data:') !== 0) &&
    (!mustBeRelative || filePath[0] !== '/')
  );
}

function joinBaseAndPath(base, urlPath) {
  if (base.indexOf('//') === -1) return base + urlPath;

  // Split out protocol first, to avoid '//' getting normalized to '/'
  var bits = base.split('//'),
      protocol = bits[0], rest = bits[1];
  // Trim any path off if this is a domain-relative URL
  if (urlPath[0] === '/')
    rest = rest.split('/')[0];
  // Join it all together
  return protocol + '//' + path.normalize("" + rest + "/" + urlPath);
}

// Default options
var defaults = {
  html: {
    'img[src]': 'src',
    'link[rel=stylesheet]': 'href',
    'script[src]': 'src',
    'video[poster]': 'poster',
    'source[src]': 'src'
  },
  css: true,
  custom: false
};


// Plugin level function(dealing with files)
function gulpCdnify(options) {

  if (!options) {
    throw new PluginError(PLUGIN_NAME, 'Missing options');
  }

  options = extend(true, {}, defaults, options);

  // Establish the rewriteURL function for this task
  var rewriteURL;
  var defaultRewrite = function (url) {
    if (isLocalPath(url))
      return joinBaseAndPath(options.base, url);
    return url;
  };
  if (typeof options.rewriter !== 'function') {
    rewriteURL = defaultRewrite;
  }
  else {
    rewriteURL = function (url) {
      return options.rewriter(url, defaultRewrite);
    }
  }

  // Creating a stream through which each file will pass
  return through.obj(function(file, enc, cb) {

    var srcFile = file.path
    if (file.isNull()) {
      // return empty file
      cb(null, file);
    }
    if (file.isBuffer()) {
      if (options.css && /\.css$/.test(srcFile)) {
        // It's a CSS file.
        var oldCSS = String(file.contents),
            newCSS = rewriteCSSURLs(oldCSS, rewriteURL)

        file.contents = new Buffer(newCSS);
        gutil.log("Changed CSS file: \"" + srcFile + "\"");
      }
      else if(options.html && /\.html$/.test(srcFile)) {
        // It's an HTML file.
        var oldHTML = String(file.contents),
            soup = new Soup(oldHTML);

        for (var search in options.html) {
          var attr = options.html[search];
          if (attr) soup.setAttribute(search, options.html[search], rewriteURL);
        }

        // Update the URLs in any embedded stylesheets
        soup.setInnerHTML('style', function (css) {
          return rewriteCSSURLs(css, rewriteURL);
        });

        // Write it to disk
        file.contents = new Buffer(soup.toString())
        gutil.log("Changed HTML file: \"" + srcFile + "\"");
      }
      else if(options.custom){
        for(var ipath in options.custom){
          // Custom based on regex
          if((new RegExp(ipath)).test(srcFile)){
            var oldContent = String(file.contents);
            var parts = [];
            for(var i in options.custom[ipath]){
              var ref = options.custom[ipath][i];
              var matches;
              var index = 0;
              while((matches = ref.pattern.exec(oldContent)) !== null){
                parts.push(Buffer(oldContent.substring(index, matches['index'])));
                parts.push(Buffer(ref.rewrite(matches, rewriteURL)));
                index = matches['index']+matches[0].length;
              }
            }

            parts.push(Buffer(oldContent.substr(index)));
            file.contents = Buffer.concat(parts);
            gutil.log("Changed file: \"" + srcFile + "\"");
          }
        }
      }
    }
    if (file.isStream()) {
      throw new PluginError(PLUGIN_NAME, 'Stream not supported');
    }
    cb(null, file);
  });

};

// Exporting the plugin main function
module.exports = gulpCdnify;
