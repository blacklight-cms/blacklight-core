var SlingConnector = require("sling-connector");
var _path=require("path");	

module.exports=function(blacklight, options){

	blacklight.markedBuilder=require("./marked-builder");
	blacklight.express = require('./blacklight-express');
	blacklight.componentTypes = require('./component-types');
	blacklight.moduleLoader = require('./module-loader');
	blacklight.imgOpt = require('./img-opt');
	blacklight.hb = require("handlebars");

	var _ = blacklight._ = require("lodash");


	/*****************************************************************************************************************/
	blacklight.buildComponentRoots=function(){
		var allRoots=[];
		_.each(arguments, function(arg,idx){		
			if(!_.isArray(arg)){arg=[arg];}
			arg=_.map(arg, function(root){ 
				if(root[0]==="."){return _path.resolve(global.bl.appRoot, root); }else{return root;}
			});
			allRoots=allRoots.concat(arg);
		});
		var primaryRoot=_path.resolve(global.bl.appRoot, "components");
		if(allRoots.indexOf(primaryRoot)<0){
			allRoots.push(primaryRoot);
		}
		return allRoots;

	};



	/*****************************************************************************************************************/
	blacklight.parsePath = blacklight.express.parsePath;



	/*****************************************************************************************************************/
	blacklight.prettyName=function(value, options){
		options=options||{};
		if(value && value.replace){
			value=value.replace(/\-|\_/g, " "); 
			if(options.allCaps){
				value=value.replace(/ [a-z]|^[a-z]/g, function(v){return v.toUpperCase();});
			}else{
				value=value.charAt(0).toUpperCase() + value.slice(1);
			}
			
			value=value.replace(/([a-z][A-Z])|[a-zA-Z][0-9]|[0-9][a-zA-Z]/g, function(v){return v.charAt(0) + " " + v.charAt(1);})
			return value;
		}else{
			return "";
		}
	};

}