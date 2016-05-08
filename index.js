var http=require("http");
var _path=require("path");	
var SlingConnector = require("sling-connector");
var log=global.bl.logger.get("blacklight-cms.main");

module.exports.express = require('./lib/blacklight-express');
module.exports.componentTypes = require('./lib/component-types');
module.exports.moduleLoader = require('./lib/module-loader');
module.exports.imgOpt = require('./lib/img-opt');
var _ = module.exports._ = require("lodash");

//TODO: add img-opt and email-mailer here.

module.exports.connectionsByRunMode = function(configDictionary, options){

	return (function(){
		var scs={modes: {}, ports:{}, portCount: 0};

		_.each(configDictionary,function(val, idx){
			var opt=_.defaults(val, options);			
			var sc=new SlingConnector(opt);
			sc.runMode = idx;
			sc.blacklightPort = val.port;
			scs.modes[idx]=sc;
			if(!scs.ports[val.port]){
				scs.ports[val.port]=sc;
				scs.portCount++;
			}
		});

		scs.defaultPort = _.keys(scs.ports)[0];

		/////////////////////////////
		scs.getByReq = function(req){
			var requestPort = req.socket.localPort || scs.defaultPort;
			var slingConnector = scs.ports[requestPort];
			if(!slingConnector) throw(new Error("No sling connector matching request port: " + requestPort));
				
			var requestedMode = req.headers["x-sling-source"];
			if(requestedMode && (requestedMode!=slingConnector.runMode)){
				slingConnector=scs.modes[requestedMode];
				if(!slingConnector) throw(new Error("No sling connector matching requested mode: " + requestedMode));
			}else{
				requestedMode = slingConnector.runMode;
			}	

			return {slingConnector: slingConnector, requestedMode: requestedMode};
		};

		return scs;
	})();
};



module.exports.launchHttp = function(app, slingConnectors){
	var servers=[];
	var ports=[];
	_.each(slingConnectors.ports, function(val,port){
		if(!_.contains(ports, port)){
			log.info("Launching [" + val.runMode + "] listener on port [" + port + "]");
			servers.push(http.createServer(app).listen(port));
			ports.push(port);
		}
	});
	return servers;
};



module.exports.buildComponentRoots=function(){
	allRoots=[];
	_.each(arguments, function(arg,idx){		
		if(!_.isArray(arg)){arg=[arg];}
		arg=_.map(arg, function(root){ 
			if(root[0]==="."){return _path.resolve(global.bl.appRoot, root); }else{return root;}
		});
		allRoots=allRoots.concat(arg);
	});
	allRoots.push(_path.resolve(__dirname, "components"));
	return allRoots;

};

module.exports.parsePath = module.exports.express.parsePath;

module.exports.prettyName=function(value, options){
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


