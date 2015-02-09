
var _path = require("path");
var models = require("./models");
var componentTypes = require("./component-types");
var _=require("lodash");

/**
 * @module blacklight-express
 *
 */


/// TODO: mechanism to pass provided SlingConnector through to the model processor's "utility" object.
/// TODO: Error handling: wrap everything in a big try/catch?
/// TODO: Detect recursion loop: compare current object against global lookup stack of already-touched.  Also, hard limit depth?

/**
 * Create a Blacklight middleware for Express, pointing to a single Sling endpoint and its own component-type resolution path
 *
 * @param {Object} options - configuration options
 * @param {String|Array} options.componentPaths - Path(s) where component type definitions will be stored
 * @param {Boolean} [options.watchComponentTypes=false] - Watch for changes to component source code and reload
 * @param {SlingConnector} options.slingConnector - A fully configured SlingConnector
 * @param {Object} options.utilities - 'utilties' to be made available to all model processors (slingConnector, express.req and others will be added automatically)
 */
module.exports = function(options){
	var slingConnector = options.slingConnector;

	var registry = componentTypes.createRegistry({componentPaths: options.componentPaths});

	// Here is the actual middleware function
	return function(req, res, next){
		var path=parsePath(req.path);

		//  console.log("Blacklight retrieving from Sling: " + path.slingPath);
		slingConnector.get(path.slingPath,"infinity",function(err,slingData,slingResponseObject){
			if(err){
				console.log("SLING ERROR: ", err);
				res.json(slingData);
			}else{
				var utilties=_.defaults({express: {req: req, res: res}, sling: slingConnector}, options.utilties);

				models.generatePageModel(slingData, registry, utilties)
					.then(function(model){
						try{
							//res.json(model);
							res.send(registry.render(model.page));
						}catch(err){
							res.status(500).json({message: "Error rendering template", error: err.toString()});
						}
					}, function(err){
						res.status(500).json(err);
					})
			}
			
		})
	}
}


//////////////////////////////////////////////////////////////////////////////////////
function parsePath(path){
	var parts = path.slice(1).split("/");
	var lastPart = parts.pop();
	var selectors = lastPart.split(".");
	var name = selectors.shift();
	var ext = selectors.pop() || "";

	if(name=="index" || !name){
		name=(parts.length>0)?parts.pop():"";
	}

	var slingPath = (parts.length?"/":"") + parts.join("/") + (name?"/":"") + name + "/_jcr_content";

	return {original: path, slingPath: slingPath, selectors: selectors, extension: ext}
}

/*
	Important test cases:

	/content/en/index.mobile.html
	/content/en.mobile.html
	/content/index.mobile.html
	/content.mobile.html
	/index.mobile.html
	/

*/





