var http=require("http");	

module.exports.express = require('./lib/blacklight-express');
module.exports.componentTypes = require('./lib/component-types');
var _ = module.exports._ = require("lodash");

module.exports.connectionsByRunMode = function(configDictionary){

	return (function(){
		var scs={modes: {}, ports:{}, portCount: 0};

		_.each(configDictionary,function(val, idx){
			var sc=new SlingConnector(val);
			sc.runMode = idx;
			sc.blacklightPort = val.port;
			scs.modes[idx]=sc;
			if(!scs.ports[val.port]){
				scs.ports[val.port]=sc;
				scs.portCount++;
			}
		});

		return scs;
	})();
}



module.exports.launchHttp = function(app, slingConnectors){
	var servers=[];
	var ports=[];
	_.each(slingConnectors.ports, function(val,port){
		if(!_.contains(ports, port)){
			console.log("Launching [" + val.runMode + "] listener on port [" + port + "]");
			servers.push(http.createServer(app).listen(port));
			ports.push(port);
		}
	});
	return servers;
}