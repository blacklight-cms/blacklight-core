var http=require("http");	

module.exports.express = require('./lib/blacklight-express');
module.exports.componentTypes = require('./lib/component-types');
var _ = module.exports._ = require("lodash");

module.exports.connectionsByRunMode = function(configDictionary){

	return (function(){
		var scs={modes: {}, ports:{}};

		_.each(configDictionary,function(val, idx){
			var sc=new SlingConnector(val);
			sc.runMode = idx;
			sc.blacklightPort = val.port;
			scs.modes[idx]=sc;
			scs.ports[val.port]=sc;
		});

		return scs;
	})();
}



module.exports.launchHttp = function(app, slingConnectors){
	_.each(slingConnectors.ports, function(val,port){
		console.log("Launching [" + val.runMode + "] listener on port [" + port + "]");
		http.createServer(app).listen(port);
	});
}