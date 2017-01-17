var addHelpers=require("./lib/blacklight-helpers");
var _=require("lodash");
var _path=require("path");
var fs=require("fs");
var express=require("express");
var compression = require('compression');
var bodyParser = require('body-parser');
var http=require("http");
var SlingConnector=require("sling-connector");
var c=require("./lib/colors");


// TODO: USe node domains or other mechanism for better top-level exception handling.
// console.log("blacklight-core: index.js:  you should set up an exception-catching domain here?")

module.exports=function(options){
	
	var hostLookup={}, portLookup={}, siteLookup={};
	var trustForwardedHostHeader, globalDefaultPort;

	var blacklight = global.bl = {};

	blacklight.logger = _.get(options, "logger", require("./lib/logger"));

	options=options||{};
	options.appRoot = options.appRoot || process.env.BLACKLIGHT_ROOT;
	if(!options.appRoot){throw new Error("options.appRoot must be set to the home directory of your blacklight installation.");}
	options.appRoot = normalizePath(options.appRoot);

	var initStatus={}, initSteps=["configure","loadModules","addRoutes","buildVhostLookups","listen"];
	var pluginCategories=["emailError", "logger", "blacklightProxy", "staticTranslation"];

	addHelpers(blacklight, options);
	blacklight.plugins={};

	process.env.NODE_CONFIG_DIR = options.appRoot + "/config";
	var config = blacklight.config = require("config");



	/**********************************************************************************/
	blacklight.run = function(){
		blacklight.listen();
	}


	
	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.configure = function(){
		if(initStatus.configure){return;}
		initializeTo("configure");
		var log = global.bl.logger.get("blacklight.config");

		var siteRoot = _path.join(options.appRoot,"blacklight_modules");
		var sites = fs.readdirSync(siteRoot);
		blacklight.sites={};
		var defaultSite = blacklight.defaultSite = _.get(config,"environment.defaultSite");


		if(!defaultSite){
			if(sites.length){
				log.error("You must set 'environment.defaultSite' in your local configuration file:\n", _path.join(siteRoot,"../config/local.json"))
			}else{
				log.error("You do not appear to have any sites installed in Blacklight.\nUse `bl site install` or `bl site create` to correct this issue.")
			}
			process.exit(1);
		}


		sites.forEach((site)=>{
			var siteConfigPath = _path.join(siteRoot, site, "site/apps/config.json");
			var siteModulePath = _path.join(siteRoot, site, "site/apps/site.js"), siteModule;

			try{
				var siteConf=require(siteConfigPath);
				blacklight.sites[site]={};
				siteConf.environment = siteConf.environment || {};
				siteConf.environment = config.util.extendDeep(siteConf.environment, config.environment);
				siteConf.configPath = siteConfigPath;
				config.util.setModuleDefaults(site, siteConf); 

			}catch(err){
				return;
				// log.error("Problem loading configuration file for site '" + site + "' at:", siteConfigPath, err);
				// process.exit(1);
			}

			try{
				siteModule = require(siteModulePath);
				blacklight.sites[site].helpers = siteModule;
			}catch(err){
				log.error("Problem loading site.js for '" + site + "'", siteModulePath, err);
				throw err;
			}

		});

		blacklight.appRoot = config.appRoot = options.appRoot;
		config.environment = config[defaultSite].environment || config.environment;

		var logPlugin = global.bl.logger.get("blacklight-core");

		function configurePlugins(site){
			var configHelper = blacklight.pluginConfigHelper(site);

			var sitePlugins = _.get(blacklight.sites, [site, "helpers", "plugins"]);
			if(sitePlugins){
				pluginCategories.forEach((category)=>{
					var pluginFactory=sitePlugins[category] || blacklight[category];
					if(pluginFactory){
						var configuredPlugin=pluginFactory(config, configHelper);
						if(site===blacklight.defaultSite){
							blacklight[category]=configuredPlugin;
						}

						// logPlugin.debug("Configuring plugin '" + category + "' for site '" + site + "'");
						_.set(blacklight,[category,"sites",site], configuredPlugin);

					}
				});
			}
		}

		configurePlugins(defaultSite);
		sites.forEach((site)=>{
			if(site!==defaultSite){
				configurePlugins(site);
			}
		});

		var defaultAppsMount = normalizePath(_.get(config, defaultSite + ".appsMount"));
		var defaultPublicMount = normalizePath(_.get(config, defaultSite + ".publicMount"));
		blacklight.appsMount=defaultAppsMount;
		blacklight.publicMount=defaultPublicMount;

		sites.forEach((site)=>{
			//  Normalize appsMount, publicMount, baseUri values
			var siteConfig = config[site];
			var appProperty = site + ".appsMount";
			var pubProperty = site + ".publicMount";

			_.set(config, appProperty, normalizePath(_.get(config,appProperty)), defaultAppsMount);
			_.set(config, pubProperty, normalizePath(_.get(config,pubProperty)), defaultPublicMount);

			if(siteConfig && siteConfig.slingBasePath){siteConfig.slingBasePath = ("/" + _.trim(siteConfig.slingBasePath,"/") + "/");}


			var blSlingConfig = _.get(blacklight.sites, ["blacklight","helpers","slingConfig"],()=>{return{};})(siteConfig);
			var siteSlingConfig = _.get(blacklight.sites, [site,"helpers","slingConfig"],()=>{return{};})(siteConfig);

			// combine "blacklight.site" slingConfig with each site-specific slingConfig.  
			var helperSlingConfigs = _.defaults(blSlingConfig, siteSlingConfig);
			if(blSlingConfig.preprocessors && siteSlingConfig.preprocessors){
				helperSlingConfigs.preprocessors = blSlingConfig.preprocessors.concat(siteSlingConfig.preprocessors);
			}

			var slings = _.get(config, site + ".modes");
			_.each(slings,(host,key)=>{
				var sling=host.sling;
				if(!sling.baseUri){throw new Error("Missing baseUri in sling configuration: " + site + ".modes." + key + ".sling");}
				sling.baseUri = sling.baseUri.replace(/\/$/,"");
				host.sling = _.defaults(host.sling, helperSlingConfigs)  // take result of merging bl.site's, and the current site's, configs (from the site.js "helper" configs) and merge that result into config.json's sling config values
			})

		});

		config.get("environment"); // Invoke a "get" call, just to make the config immutable.

	}





	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.loadModules = function(){
		initializeTo("loadModules");

		// /// Instantiate sling connectors for all sites
		// _.each(blacklight.sites, (siteObject, site)=>{
		// 	var slingConfigs = _.get(blacklight.config[site], "modes"), defaultConfig;
		// 	if(slingConfigs){
		// 		var defaultConfigBuilder = _.get(siteObject, "helpers.slingConfig");
		// 		if(defaultConfigBuilder){
		// 			defaultConfig=defaultConfigBuilder()

		// 		}
		// 	}
		// });

		blacklight.modules = blacklight.moduleLoader({siteConnections: blacklight.sites, defaultSite: blacklight.defaultSite});

	}




	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.addRoutes = function(){
		initializeTo("addRoutes");
		var requestPreprocessors=[];

		// forEach site that actually has vhost definitions, create an app, and attach it to the blacklight.sites object

		// TODO: each site definition now needs to include a "primaryContentPath" (/content/fourseasons)  and "hostRegex"
			// (these can be auto-generated by inference, but also overridden by user)


		_.each(blacklight.sites, (siteObject, site)=>{
			var siteConfig = _.get(config, site);
			var siteEnvironment = _.get(config, site + ".environment");
			var siteHelpers = _.get(siteObject, "helpers", {});
			var modes = _.get(siteConfig, "modes");

			if(!modes){return;}

			var app = express();
			app.disable('x-powered-by');


			var blacklightProxy = siteEnvironment.blacklightProxy;

			if(blacklightProxy && !blacklightProxy.disabled){
				console.log("Launching site '" + site + "' via blacklight proxy to", siteConfig.environment.blacklightProxy);
				app.all( siteConfig.appsMount + "*", blacklightProxy.appsProxy());
				app.all( siteConfig.publicMount + "img-opt/*", blacklightProxy.appsProxy());
				// TODO: rooted routes are not currently added into bl-proxy.  how would you do that?

				var slingBaseRegex = "^/content/" + site + "/";
				if(siteConfig.slingBasePath){slingBaseRegex="^" + siteConfig.slingBasePath;}

				requestPreprocessors = [
					{path: slingBaseRegex, proxy: blacklightProxy.contentProxy}
				];

			}else{

				app.use(siteConfig.publicMount + "img-opt/", blacklight.imgOpt(siteEnvironment.imageOptimizer));

				// GZIP compression, applies to all subsequent middleware responses with appropriate content-types
				app.use(compression({threshold: 0}));  


				// All module "rooted-routes"  mounted here
				app.all(
					bodyParser.json(),        			
					bodyParser.urlencoded({extended: true}),
					// TODO: add authenticator here?  
					blacklight.modules.rootedRouter);


				// All site/project-level routers mounted here
				app.use(siteConfig.appsMount, 
					bodyParser.json(),        					
					bodyParser.urlencoded({extended: true}),   
					blacklight.modules.router);


				// var requestPreprocessors = _.get(blacklight, "sites.blacklight.helpers.preprocessors", ()=>{return []})();


				if(siteHelpers.preprocessors){
					requestPreprocessors = requestPreprocessors.concat(siteHelpers.preprocessors({modules: blacklight.modules}));
				}

			}


			// TODO: per-site favicon customization

			// Static file handler (i.e /public files)
			var staticHandler = express.static(options.appRoot + "/public/", {etag: false});
			if(siteHelpers.assetHandler){
				staticHandler = siteHelpers.assetHandler(staticHandler);
			}

			// console.log("Public mount for '" + site + "'", siteConfig.publicMount);

			app.use(siteConfig.publicMount, 
				staticHandler,  
				function(req,res,next){
					res.status(404).send("404 error: Static asset not found");
				}
			);
			

			var wellKnownStaticHandler = express.static(options.appRoot + "/public/" + site + "/site/.well-known/", {etag: false});
			app.use("/.well-known/", 
				wellKnownStaticHandler,  
				function(req,res,next){
					res.status(404).send("404 error: Static asset not found");
				}
			);



			var componentPaths = blacklight.buildComponentRoots(siteConfig.componentRoots);
			var env = siteConfig.environment || {};
			var devMode = env.devMode;


			var staticTranslation = _.get(blacklight,["staticTranslation","sites",site], ()=>{return "ERROR: Translate plugin not installed";});

			// Configure and inject Blacklight handler
			app.use(
		    blacklight.express({
				publicRoot: _path.resolve(options.appRoot, "public") ,
				componentPaths: componentPaths,  
				componentCacheClearOnChange: firstDef(env.componentCacheClearOnChange, devMode),
				componentCacheDisable: env.componentCacheDisable,
				utilities: blacklight.modules.modelHelpers,
				language: siteConfig.language,
				postProcessOptions:{minifyHTML: firstDef(env.minifyHTML, !devMode), beautifyHTML: firstDef(devMode, true)},

				translationMethod: staticTranslation,
				emailError: blacklight.emailError ? blacklight.emailError : ()=>{},

				environmentName: env.environmentName,
				requestPreprocessors: requestPreprocessors,
				skipModelProcessors: env.blacklightProxy?true:false
			}));

			siteObject.app = app;
		});


		function firstDef(value, fallback){
			if(typeof(value)==="undefined"){
				return fallback;
			}else{
				return value;
			}
		}
	
	}





	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.buildVhostLookups = function(){
		initializeTo("buildVhostLookups");

		// build lookup tables

		// Need site + sling-source. So go through the following until you have both:
		// 	hostname
		// 	port
		// 	x-sling-source  (including dotted site.mode format)


		// HOST dictionary key:  can either be  "*.something.specific"  or  "something.exactly.specific"
		// Examples:  "www.my-site.com", *.my-site.com"  "*.ms.local"  ["*.stage.my-site.com","www.my-site.com"]



		_.each(blacklight.sites, (siteObject, site)=>{

			var siteApp=siteObject.app;
			if(!siteApp){return;}
			var siteConfig = config[site];
			var defaultHostname = siteConfig.hostname;
			var baseSettings = {site: site, app: siteApp, siteConfig: siteConfig};
			var isDefaultSite  =  (site === blacklight.defaultSite);
			var DEFAULT_PORT = 4400;


			if(defaultHostname && !_.isArray(defaultHostname)){defaultHostname = [defaultHostname];}


			function addVhost(hostname, port, settings){
				var vhost=hostname + ":" + port;
				var scId = settings.site + "." + settings.mode;


				if(hostLookup[vhost]){
					console.log(c.red("\n\nERROR: "), c.yellow("Duplicate vhost entry for site:"), c.white(scId), 
						c.yellow("\n\tPlease make sure you have a unique hostname and/or port specified in the BL configuration for:"), 
						c.white("\n\t" + settings.site + ".modes." + settings.mode + "\n\n") );
					throw new Error("Configuration problem: duplicate vhost entry '" + vhost + "' for [" + scId + "]")
				}
				hostLookup[vhost] = settings;
			}

			_.each(siteConfig.modes, (host, mode)=>{
				var currentVhost = _.assign({mode:mode, sling: new SlingConnector(host.sling)}, baseSettings);
				currentVhost.reqBl={sling: currentVhost.sling, mode: mode, site: site, config: siteConfig, plugins:{}};
				_.each(pluginCategories, (pluginId)=>{
					if(blacklight[pluginId]){
						currentVhost.reqBl.plugins[pluginId]=_.get(blacklight,[pluginId, "sites", site], blacklight[pluginId]);
					}
				});


				siteLookup[site + "." + mode] = currentVhost;
				var port = host.port || siteConfig.port || DEFAULT_PORT;

				var scSpecificHostname=host.hostname;
				if(scSpecificHostname){
					if(!_.isArray(scSpecificHostname)){scSpecificHostname = [scSpecificHostname];}					
					scSpecificHostname.forEach((hostname)=>{
						addVhost(hostname, port, currentVhost);
					});
				}else{
					if(defaultHostname){
						for(var i=0; i<defaultHostname.length; i++){
							if(mode==="publish"){
								addVhost(defaultHostname[i], port, currentVhost);
							}else{								
								var parts=defaultHostname[i].match(/(^www\.|^\*\.)(.*)/);     // This is a non-publish SC without a hostname entry, so auto-generate a name
								if(parts){
									addVhost(mode + "." + parts[2], port, currentVhost);
								}else{
									addVhost(mode + "." + defaultHostname[i], port, currentVhost);
								}
							}							
						}						
					}else{
						// no specific or default hostname, and if there is no port specified up the port number by 1.
						if(mode==="publish" && !host.port){port=port+1;}
						addVhost("*", port, currentVhost);						
					}
				}

				var existingDefault = portLookup[port];
				if(existingDefault){
					if((isDefaultSite || existingDefault.site === site) && (mode==="publish")){
						portLookup[port] = currentVhost;
					}
				}else{
					portLookup[port] = currentVhost;
				}

				if(isDefaultSite && mode === "publish"){
					globalDefaultPort = port;
				}

			});


			_.each(portLookup, (portApp, port)=>{
				var vhost="*:"+port;
				hostLookup[vhost]=null;
				addVhost("*", port, portApp);
			})

			// iterate over all hostLookup entries, and compare with all siteLookup entries.  
			// And then make sure all siteLookup entries have a vhost (so no sites/modes are orphaned)

			console.log()
			_.each(hostLookup,(hostApp, host)=>{
				console.log(c.magenta("VHOST:"), c.blue("Listening for"), c.white("[" + hostApp.site + "." + hostApp.mode + "]"), c.blue("on"), c.white("[" + host + "]"));				
			})


			_.each(siteLookup,(siteApp, site)=>{
				var found=false;
				_.each(hostLookup,(hostApp, host)=>{
					if(siteApp===hostApp){
						found=true;
						return false;
					}
				})
				if(!found){
					var msg="No route to virtual host: "
					console.log(c.magenta("\nWARNING:"), c.blue(msg), c.white(site) + "\n", c.blue("        To connect, add a unique hostname and/or port for this `modes` entry in your configuration file."));
				}
			})

			console.log();

		});
	}

	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.listen = function(){
		initializeTo("listen");


		var servers=[];
		var log=global.bl.logger.get("blacklight-core.vhost-lookup");
		var server;
		var trustSlingSourceHeader = config.environment.trustSlingSourceHeader;

		function resolveVhost(req, res, thereIsNoNextWithoutExpress){
			var port = req.socket.localPort;
			var host = req.headers.host;
			var server, usedSlingSource=false;


			if(trustSlingSourceHeader && req.headers["x-sling-source"]){
				var parts = req.headers["x-sling-source"].split("."), site, mode;
				if(parts[1]){
					site=parts[0];
					mode=parts[1];
				}else{
					site=blacklight.defaultSite;
					mode=parts[0];
				}
				var id=site + "." + mode;
				server = siteLookup[id];
				usedSlingSource = true;

			}else{
				if(!port && req.socket.address){
					port = req.socket.address().port || globalDefaultPort;
				}

				if (trustForwardedHostHeader && req.headers["x-forwarded-host"]) {
					host = req.headers["x-forwarded-host"];
				}


				if (host){
					host = host.split(':')[0];
				}else{
					host="*";
				}

				host = host + ":" + port;

				server = hostLookup[host];
				if (!server){
					host = "*" + host.substr(host.indexOf("."));
					server = hostLookup[host];
					hostLookup[host]=server;   // Auto-include this vhost entry into the lookup table.  TODO: infinitely variable wildcards + maliciousness could overfill this table.
				}
				if (!server){
					// TODO: make sure we don't allow an existing explicit hostname for a given mode to be resolved on the wrong port.
					host = "*:" + port;
					server = hostLookup[host];
					hostLookup[host]=server;   // Auto-include this vhost entry into the lookup table.  TODO: infinitely variable wildcards + maliciousness could overfill this table.
				} 			
			}

			if(!server){
				log.error("Failed to find host via ", (usedSlingSource ? ("x-sling-source: " + req.headers["x-sling-source"]) : ("hostname: " + host)) );
				res.writeHead(404, {"content-type":"text/html"})
				res.write("Unknown host requested\n");
				res.end();
			}else{
				req.bl=server.reqBl;
				return server.app(req, res);
			}

		}


		_.each(portLookup, (portApp, port)=>{
			log.info("Listening on port [" + port + "]");
			servers.push(http.createServer(resolveVhost).listen(port));
		});
		
		return servers;
	
	}

	/**********************************************************************************/
	/**********************************************************************************/
	var initializeTo=function(endStep){
		var i=0, done=false;
		var stepIndex=initSteps.indexOf(endStep);
		if(stepIndex<0){throw new Error("Bad init step: " + endStep);}
		var prevStep=initSteps[stepIndex-1];

		if(prevStep && !initStatus[prevStep]){
			blacklight[prevStep]();
		}

		initStatus[endStep]=true;
	}



	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.pluginConfigHelper = function(site){
		var computedSite = site || blacklight.defaultSite;
		var slings;
		var $={
			site:site, 
			config:config,
			siteConfig:config[computedSite],
			siteObject:blacklight.sites[computedSite],
			getSlings: function(){
				if(!slings){
					slings={};
					/// TODO: don't regenerate sling object.  instead pull from siteLookup[site + "." + host];
					_.each(_.get(config,[computedSite,"modes"]), (host, mode)=>{
						if(host.sling){  slings[mode]= new SlingConnector(host.sling); }
					});
				}
				return slings;
			},
			getEnv: (property, defaults)=>{
				var propertyPath = "environment." + property;
				var val=_.get(config[site], propertyPath, _.get(config, propertyPath));
				if(typeof val === "object"){
					defaults = typeof defaults === "object" ? defaults : {};
					return _.assign(defaults, val);
				}else{
					return val || defaults;
				}
			}
		};
		return $;
	}


	/**********************************************************************************/
	function normalizePath(path){
		return (path && path.replace) ? (path.replace(/\/$/,"") + "/") : "";
	}

	/**********************************************************************************/
	return blacklight;
}



