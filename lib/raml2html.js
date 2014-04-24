#!/usr/bin/env node

var raml = require('raml-parser'),
    handlebars = require('handlebars'),
    hljs = require('highlight.js'),
    marked = require('marked'),
    fs = require('fs'),
    program = require('commander'),
    basePath;

function parseBaseUri(ramlObj) {
    // I have no clue what kind of variables the RAML spec allows in the baseUri.
    // For now keep it super super simple.
    if (ramlObj.baseUri){
        ramlObj.baseUri = ramlObj.baseUri.replace('{version}', ramlObj.version);
    }
    return ramlObj;
}

function makeUniqueId(resource) {
    var fullUrl = resource.parentUrl + resource.relativeUri;
    return fullUrl.replace(/[\{\}\/}]/g, '_');
}

function traverse(ramlObj, parentUrl, allUriParameters) {
    var resource, index;
    for (index in ramlObj.resources) {
        resource = ramlObj.resources[index];
        resource.parentUrl = parentUrl || '';
        resource.uniqueId = makeUniqueId(resource);
        resource.allUriParameters = [];

        if (allUriParameters) {
            resource.allUriParameters.push.apply(resource.allUriParameters, allUriParameters);
        }

        if (resource.uriParameters) {
            var key;
            for (key in resource.uriParameters) {
                resource.allUriParameters.push(resource.uriParameters[key]);
            }
        }

        traverse(resource, resource.parentUrl + resource.relativeUri, resource.allUriParameters);
    }

    return ramlObj;
}

function markDownHelper(text) {
    if (text && text.length) {
        return new handlebars.SafeString(marked(text));
    } else {
        return '';
    }
}

function hashHelper() {
  var r = Array.prototype.slice.call(arguments);

  r.pop();

  var text = r.join();

  if (text && text.length) {
    var hash = 0;
    if (text.length == 0) return hash;
    for (i = 0; i < text.length; i++) {
      char = text.charCodeAt(i);
      hash = ((hash<<5)-hash)+char;
    }
    return hash;
  } else {
    return '';
  }
}

function merge_options(obj1,obj2){
  var obj3 = {};
  for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
  for (var attrname in obj2) { obj3[attrname] = obj2[attrname]; }
  return obj3;
}

function replaceRef(obj, path)
{

  for(var i in obj) {
      if (obj.hasOwnProperty(i)) {
        if(obj[i] instanceof Object) {
          obj[i] = replaceRef(obj[i], path);
        }

        if (i == "$ref" && obj[i][0] !== "#") {

           var schema = JSON.parse(fs.readFileSync(path+obj[i]));
            path = basePath + 'schemas/' + schema.id.substring(0,schema.id.lastIndexOf("/")+1);


           obj = replaceRef(schema, path);
        }
    }
  }

  return obj;
}

function highlightHelper(text) {
  if (text && text.length) {

      var schema = JSON.parse(text);

      if(schema["$schema"]) {
        var path = basePath + 'schemas/' + schema.id.substring(0,schema.id.lastIndexOf("/")+1);
        text = JSON.stringify(replaceRef(schema, path), false, " ");
      }

      return new handlebars.SafeString(hljs.highlightAuto(text).value);
    } else {
      return '';
    }
}

function uriToNameHelper(text)
{
  if (text && text.length) {

    return text.substring(1).replace(/[_-]/g, ' ').replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});

  } else {
    return '';
  }
}

function parseWithConfig(source, config, onSuccess, onError) {
    basePath = source.substring(0,source.lastIndexOf("/")+1);

    raml.loadFile(source).then(function(ramlObj) {
        ramlObj = parseBaseUri(ramlObj);
        ramlObj = traverse(ramlObj);

        ramlObj.resources.sort(function(a, b) {
          return a.relativeUri.localeCompare(b.relativeUri);
        });

        // Register handlebar helpers
        for (var helperName in config.helpers) {
            handlebars.registerHelper(helperName, config.helpers[helperName]);
        }

        // Register handlebar partials
        for (var partialName in config.partials) {
            handlebars.registerPartial(partialName, config.partials[partialName]);
        }

        var result = config.template(ramlObj);
        onSuccess(result);
    }, onError);
}

function parse(source, onSuccess, onError) {
    var template = require('./template.handlebars');
    var resourceTemplate = require('./resource.handlebars');

    var config = {
         'template': template,
         'helpers': {
             'md': markDownHelper,
             'hash': hashHelper,
             'highlight': highlightHelper,
             'uriToName': uriToNameHelper
         },
         'partials': {
             'resource': resourceTemplate
         }
     };

    parseWithConfig(source, config, onSuccess, onError);
}

if (require.main === module) {

    program
      .usage('[options] <file>')
      .version('0.0.1')
      .option('-r, --raml [file]', 'The RAML file to parse')
      .parse(process.argv);

    if(!program.raml) {
      console.error('You need to specify the the input raml file!');
      program.help();
      process.exit(1);
    }

    if (program.args.length !== 1) {
      console.error('You need to specify the destination!');
      program.help();
      process.exit(1);
    }

    fs.writeFileSync(program.args[0], 'Pending...');

    console.log('Converting RAML to HTML');

    // Start the parsing process
    parse(program.raml, function(result) {

        fs.writeFileSync(program.args[0], result);
        console.log('File written successfully');
        process.exit(0);

    }, function(error) {
        console.log('Error parsing: ' + error);
        process.exit(1);
    });
}

module.exports.parse = parse;
module.exports.parseWithConfig = parseWithConfig;
