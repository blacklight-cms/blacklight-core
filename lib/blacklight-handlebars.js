
global.bl.hb = global.bl.hb || require("handlebars");
var HB = global.bl.hb;
var _=require("lodash");
var _path=require("path");
var fs=require("fs");

module.exports.registerBlacklightHelpers=function(registry, translationMethod){
	
	revCache={};


	/////////////////////////////////////////////////////////////////////////////////////////////
	/// TODO: need to better validate types of parameters (model, resourceType and option), since they are completely variadic.
	/// TODO: If object, assume it is the model.  If string, assume it is resourceType.  If resource type is first, and no object, then it is just a direct "script" include
	HB.registerHelper("component", function(model, resourceType,  options){
		var data={};
		if(_.isString(model)){
			// TODO: only a string has been specified in args, so treat it as a relative path
		}


		if(!_.isString(resourceType)){
			options=resourceType;
		}

		var optionsOrig=options;

		if (options.data && options.ids) {
			data = createFrame(options.data);
			data.contextPath = HB.Utils.appendContextPath(options.data.contextPath, options.ids[0]);
	        //console.log("Appending to context path:", options.data.contextPath, ": " , options.ids);
			_.each(options.hash, function(val, key){
				if(!_.contains(["root","index","key","first","last", "contextPath"], key))
					data[key]=val;
			} );			
		}

		if(model){
			var type=registry.getResourceType(model);

			// console.log("COMPONENT:", _.isString(resourceType)?resourceType:type, model);


			if(_.isString(resourceType)){  // if "component" helper was called with a specified "resourceType" 
				if(resourceType=="raw"){
					return  new HB.SafeString(registry.renderRaw(model));  // special "virtual" resource type of "raw" 
				}else{
					type=resourceType;  // otherwise specified resource type overrides model's type
				}
			}

			var page={};
			if(model._meta && model._meta.utilities && model._meta.utilities.page)
				page = model._meta.utilities.page;

			if(type){
				var componentType=registry.get(type);

				if(options.fn){
					data.yield = new HB.SafeString(options.fn(model, {data:data}));
				}

				if(componentType.render){			
					return new HB.SafeString(componentType.render(model, {data: data}, page.selectors, page.extension));
				}
				else
					return "No render function for: " + type;
			}else{
				console.error("No _sling_resourceType in model: ", model);
				if(data.root && data.root.meta && data.root.meta.author){
					return new HB.SafeString("<div style='border:1px solid #911;background-color:#fdd;color:#911; padding:8px; margin:8px;'>Error: no _sling_resourceType found in included component</div>");
				}else{
					return("");
				}
			}
		}else{
			if(options.inverse){
				return new HB.SafeString(options.inverse(model, {data:data}));
			}
		}
	});



	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper("if-author", function(options){
		if(options.data.root && options.data.root.meta && options.data.root.meta.author)
			options.fn(this);
		else
			options.inverse(this);
	} );



	/////////////////////////////////////////////////////////////////////////////////////////////
	function ifop(v1, operator, v2, options, inverse){
		var truePath, falsePath;

		if(v2 && v2.fn){options=v2;v2=null;}

		if(inverse){
			truePath=options.inverse; falsePath=options.fn;
		}else{
			truePath=options.fn; falsePath=options.inverse;
		}

    	switch (operator) {
			case '==':
			   return (v1 == v2) ? truePath(this) : 	falsePath(this);
			case '!=':
			   return (v1 == v2) ? falsePath(this) : 	truePath(this);
			case '===':
			   return (v1 === v2) ? truePath(this) : falsePath(this);
			case '<':
			   return (v1 < v2) ? truePath(this) : falsePath(this);
			case '<=':
			   return (v1 <= v2) ? truePath(this) : falsePath(this);
			case '>':
			   return (v1 > v2) ? truePath(this) : falsePath(this);
			case '>=':
			   return (v1 >= v2) ? truePath(this) : falsePath(this);
			case '&&':
			   return (v1 && v2) ? truePath(this) : falsePath(this);
			case '||':
			   return (v1 || v2) ? truePath(this) : falsePath(this);

			case 'contains':
			   return (v1.indexOf?(v1.indexOf(v2)>-1):false) ? truePath(this) : falsePath(this);


			case 'nonmeta':
			   return (!(v1?v1.toString():"").match(/^(jcr|bl|cq|sling)\:/)) ? truePath(this) : falsePath(this);

			case 'nonblank':
			   return v1 ? truePath(this) : falsePath(this);

			case 'iseven':
			   if((v1 % 2)===0){return truePath(this);}
			   else{return falsePath(this);}

			break;


			case 'isstring':
			   if(_.isString(v1)){return truePath(this);}
			   else{return falsePath(this);}

			break;



			case 'in':
			   var parts=v2.split(",");
			   if(parts.indexOf(v1)<0){return falsePath(this);}
			   else{return truePath(this);}        
			break;


			default:
			   throw new Error("ifOp: unknown operator: '" + operator + "'");
    	}
	}


	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('ifOp', function (v1, operator, v2, options) {
		return ifop.bind(this)(v1,operator,v2, options, false);
	});

	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('ifop', function (v1, operator, v2, options) {
		return ifop.bind(this)(v1,operator,v2, options, false);
	});

	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('ifnot', function (v1, operator, v2, options) {
		return ifop.bind(this)(v1,operator,v2, options, true);
	});

	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('ifnot', function (v1, operator, v2, options) {
		return ifop.bind(this)(v1,operator,v2, options, true);
	});


	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('translate', function (key, options) {
		if(!translationMethod){throw new Error("no translationMethod specified in Handlebars configuration");}
		return  new HB.SafeString(translationMethod(key, options));
	});


	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('replace', function (value, find, replace, options) {
		replace = replace || "";
		if(!value)return "";
		return value.replace(new RegExp(find, "g"), replace);
    });


	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('trim', function (value, options) {
		if(value && value.trim)
			return value.trim();
		else
			return value;
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
	HB.registerHelper('rev', function (path, options) {
		var cached;
		if(cached=revCache[path]){
			return cached;
		}else{
			var filePath = registry.publicRoot + path.replace(/^\/[^\/]+/,"");
			try{
				var stat=fs.statSync(filePath);	
				var stamp = Math.floor(stat.mtime.getTime()/1000);
				var newPath = path.replace(/([^\.]+)$/, stamp + ".$1");
				revCache[path]=newPath;
				return newPath;
			}catch(err){
				msg="Problem examining timestamp of file for Handlebars revision helper: " + filePath;
				revCache[path]=msg;
				return msg;
			}
		}

    });



	//*****************************************************************************//
	HB.registerHelper("log", function(logMe, userLabel) {
		var label="TEMPLATE_LOG:";
		if(typeof(label)==="string"){
			label=userLabel;
		}
			console.log(label, logMe);
	});



	/////////////////////////////////////////////////////////////////////////////////////////////
	HB.registerHelper('img-opt', function (path, options) {
		var meta={img_opt:{}, blacklight:{}};
		if(!options){
			throw new Error("img-opt error: you must provide an image path to the handlebars helper");
		}

		var prefs=options.hash;

		if(options.data && options.data.root && options.data.root.meta){
			meta=options.data.root.meta;
			meta.img_opt=meta.img_opt||{};
			meta.blacklight=meta.blacklight||{};
		}

		var quality=prefs.quality || meta.img_opt.default_quality || 70;
		var size=prefs.size || "";
		if(size){size = "."+size;}


		if(!meta.blacklight.sling_source){
			throw new Error("img-opt error: you must provide a correct 'sling_source' indicator (author/publish) in @root.meta.blacklight.sling_source");
		}

		if(path && path.match && path.match(/\.(png|svg|gif)$/)){
			return path;
		}

		if(path && path.match && path.match(/^\/content\/dam\//)){
			return global.bl.publicMount + "img-opt/" + meta.blacklight.sling_source + path + "/" + quality + size + ".jpg";
		}else{
			return global.bl.publicMount + "blacklight/display/bad-img-opt-path.jpg?path=" + escape(path);
		}

   });


	/////////////////////////////////////////////////////////////////////////////////////////////
	var createFrame = function(object) {
	  var frame = HB.Utils.extend({}, object);
	  frame._parent = object;
	  return frame;
	};

}

