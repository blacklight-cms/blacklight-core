
var HB = module.exports = require("handlebars");
var _=require("lodash");
var _path=require("path");

module.exports.registerBlacklightHelpers=function(registry){
	
	/////////////////////////////////////////////////////////////////////////////////////////////
	/// TODO: need to better validate types of parameters (model, resourceType and option), since they are completely variadic.
	/// TODO: If object, assume it is the model.  If string, assume it is resourceType.  If resource type is first, and no object, then it is just a direct "script" include
	HB.registerHelper("component", function(model, resourceType,  options){
		if(_.isString(model)){
			// TODO: only a string has been specified in args, so treat it as a relative path
		}

		if(!_.isString(resourceType)){
			options=resourceType;
		}


		if (options.data && options.ids) {
			var data = createFrame(options.data);
			data.contextPath = HB.Utils.appendContextPath(options.data.contextPath, options.ids[0]);
	        //console.log("Appending to context path:", options.data.contextPath, ": " , options.ids);
			_.each(options.hash, function(val, key){
				if(!_.contains(["root","index","key","first","last", "contextPath"], key))
					data[key]=val;
			} ); 
			options = {data: data};
		}

		if(model){
			var type=registry.getResourceType(model);


			if(_.isString(resourceType)){  // if "component" helper was called with a specified "resourceType" 
				if(resourceType=="raw"){
					return  registry.renderRaw(model);  // special "virtual" resource type of "raw" 
				}else{
					type=resourceType;  // otherwise specified resource type overrides model's type
				}
			}

			var page={};
			if(model._meta && model._meta.utilities && model._meta.utilities.page)
				page = model._meta.utilities.page;

			if(type){
				var componentType=registry.get(type);
				if(componentType.render){			
					return componentType.render(model, options, page.selectors, page.extension);
				}
				else
					return "No render function for: " + type;
			}else{
				console.error("No _sling_resourceType in model: ", model);
				return "<pre>Error: no _sling_resourceType found in included component</pre>"
			}
		}
	} );



	/////////////////////////////////////////////////////////////////////////////////////////////
	/// TODO: need to better validate types of parameters (model, resourceType and option), since they are completely variadic.
	/// TODO: If object, assume it is the model.  If string, assume it is resourceType.  If resource type is first, and no object, then it is just a direct "script" include
	HB.registerHelper("ifAuthor", function(options){
		var authorFn = options.fn;
		var notAuthorFn = options.inverse;
		if(true)
			authorFn();
		else
			notAuthorFn();
	} );


	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('ifOp', function (v1, operator, v2, options) {

    	switch (operator) {
        case '==':
            return (v1 == v2) ? options.fn(this) : 	options.inverse(this);
        case '!=':
            return (v1 == v2) ? options.inverse(this) : 	options.fn(this);
        case '===':
            return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '<':
            return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=':
            return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>':
            return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=':
            return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&':
            return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||':
            return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default:
            return options.inverse(this);
    	}
    });


	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('replace', function (value, find, replace, options) {
		replace = replace || "";
		if(!value)return "";
		return value.replace(new RegExp(find, "g"), replace);
    });


	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('get-alpha', function (key, options) {
		if(options.data && options.data.contextPath){
			var targetPath = options.data.contextPath.replace(/\./g,"/");
			var keyPath = key.replace(/([^\.\/])\./g,"$1/");
			if(keyPath[0]=="/"){
				targetPath="";
			}
			var joined = _path.join("/", targetPath, keyPath);

			var endValue=options.data.root;
			target = joined.slice(1).split("/");

			_.each(target,function(val){
				if(val && endValue){
					endValue = endValue[val]
				}
			});

			return endValue;
		}
    });

	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('count', function (countMe, options) {
		return Object.keys(countMe).length;
	});


	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('spy', function (model, options) {
		//console.log("\nOptions:", options, "\nParent:", options.data._parent, "\nModel:", model, "\n---------------------\n");
    });


	/////////////////////////////////////////////////////////////////////////////////////////////
	var createFrame = function(object) {
	  var frame = HB.Utils.extend({}, object);
	  frame._parent = object;
	  return frame;
	};

}

