
var HB = module.exports = require("handlebars");
var _=require("lodash");

module.exports.registerBlacklightHelpers=function(registry){
	
	/////////////////////////////////////////////////////////////////////////////////////////////
	/// TODO: need to better validate types of parameters (model, resourceType and option), since they are completely variadic.
	/// TODO: If object, assume it is the model.  If string, assume it is resourceType.  If resource type is first, and no object, then it is just a direct "script" include
	HB.registerHelper("component", function(model, resourceType, options){
		if(_.isString(model)){
			// TODO: only a string has been specified in args, so treat it as a relative path
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

			if(type){
				var componentType=registry.get(type);
				if(componentType.render)			
					return componentType.render(model);
				else
					return "No render function for: " + type;
			}else{
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
            return (v1 == v2) ? options.fn(this) : options.inverse(this);
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

}

