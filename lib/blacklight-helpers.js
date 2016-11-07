var SlingConnector = require("sling-connector");
var _path=require("path");	

module.exports=function(blacklight, options){

	blacklight.logger = options.logger || require("./logger");
	blacklight.markedBuilder=require("./marked-builder");
	blacklight.express = require('./blacklight-express');
	blacklight.componentTypes = require('./component-types');
	blacklight.moduleLoader = require('./module-loader');
	blacklight.imgOpt = require('./img-opt');
	blacklight.hb = require("handlebars");

	var _ = blacklight._ = require("lodash");



	/*****************************************************************************************************************/
	blacklight.connectionsByRunMode = function(slingConfigs, options){

		return (function(){
			var scs={modes: {}, ports:{}, portCount: 0};

			_.each(slingConfigs,function(slingConfig, mode){
				var opt=_.defaults(slingConfig, options);			
				var sc=new SlingConnector(opt);
				sc.runMode = mode;
				sc.blacklightPort = slingConfig.port;
				scs.modes[mode]=sc;
				if(!scs.ports[slingConfig.port]){
					scs.ports[slingConfig.port]=sc;
					scs.portCount++;
				}
			});


			/////////////////////////////
			scs.getByReq = function(req, overrides){
				var requestedMode,slingConnector;

				if(req.sling){
					slingConnector=req.sling.slingConnector;
					requestedMode=req.sling.requestedMode;
				}else{
					var requestPort = req.socket.localPort || _.keys(scs.ports)[0]; // use default (i.e. first) port if no localPort
					slingConnector = scs.ports[requestPort];
					if(!slingConnector){ throw(new Error("No sling connector matching request port: " + requestPort));}
						
					requestedMode = req.headers["x-sling-source"];
					if(requestedMode && (requestedMode!==slingConnector.runMode)){
						slingConnector=scs.modes[requestedMode];
						if(!slingConnector){ throw(new Error("No sling connector matching requested mode: " + requestedMode));}
					}else{
						requestedMode = slingConnector.runMode;
					}				
				}

				if(overrides){
					slingConnector = new SlingConnector(_.assign(slingConnector, overrides));
				}
		
				return {slingConnector: slingConnector, requestedMode: requestedMode};
			};

			return scs;
		})();
	};







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
		allRoots.push(_path.resolve(global.bl.appRoot, "components"));
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