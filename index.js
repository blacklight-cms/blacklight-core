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

// Sequencing is a big issue.  When do you get logger config, etc.  Need minimal dependencies.
// Possibly break into functional steps and note in the bl object when each step is done.



console.log("blacklight-render: index.js:  you should set up an exception-catching domain here?")

module.exports=function(options){
	
	var hostLookup={}, portLookup={}, siteLookup={};
	var trustForwardedHostHeader;

	var blacklight = global.bl = {};

	options=options||{};
	options.appRoot = options.appRoot || process.env.BLACKLIGHT_ROOT;
	if(!options.appRoot){throw new Error("options.appRoot must be set to the home directory of your blacklight installation.");}
	options.appRoot = normalizePath(options.appRoot);

	var initStatus={}, initSteps=["configure","loadModules","addRoutes","buildServer","listen"];
	var pluginCategories=["emailError", "logger", "blacklightProxy", "staticTranslation"];

	addHelpers(blacklight, options);
	blacklight.plugins={};

	process.env.NODE_CONFIG_DIR = options.appRoot + "/config";
	var config = blacklight.config = require("config");

	if(options.pluginLoader){
		loadPlugins(options.pluginLoader);
	}


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
			log.error("You must set 'environment.defaultSite' in your local configuration file:", _path.join(siteRoot,"../config/local.json"))
			process.exit(1);
		}


		sites.forEach((site)=>{
			var siteConfigPath = _path.join(siteRoot, site, "site/apps/config.json");
			var siteModulePath = _path.join(siteRoot, site, "site/apps/site.js"), siteModule;
			blacklight.sites[site]={};

			try{
				siteModule = require(siteModulePath);
				blacklight.sites[site].helpers = siteModule;
			}catch(err){
				log.error("Problem loading site.js for '" + site + "'", siteModulePath, err);
				throw err;
			}

			try{
				var siteConf=require(siteConfigPath);
				siteConf.environment = siteConf.environment || {};
				siteConf.environment = config.util.extendDeep(siteConf.environment, config.environment);
				siteConf.configPath = siteConfigPath;
				config.util.setModuleDefaults(site, siteConf); 

			}catch(err){
				log.error("Problem loading configuration file for site '" + site + "' at:", siteConfigPath, err);
				process.exit(1);
			}
		});

		blacklight.appRoot = config.appRoot = options.appRoot;
		config.environment = config[defaultSite].environment;

		var logPlugin = global.bl.logger.get("blacklight-render");

		function configurePlugins(site){
			var configHelper = blacklight.pluginConfigHelper(site);
			pluginCategories.forEach((category)=>{
				var pluginFactory=blacklight.plugins[category];
				if(pluginFactory){
					logPlugin.debug("Configuring plugin '" + category + "' for site '" + site + "'");
					var configuredPlugin=pluginFactory(config, configHelper);
					if(site){
						blacklight[category].sites[site]=configuredPlugin;
					}else{
						blacklight[category]=configuredPlugin;
						blacklight[category].sites = {};
					}
				}
			});
		}

		configurePlugins();
		sites.forEach((site)=>{
			configurePlugins(site);
		});

		var defaultAppsMount = normalizePath(_.get(config, defaultSite + ".appsMount"));
		var defaultPublicMount = normalizePath(_.get(config, defaultSite + ".publicMount"));
		blacklight.appsMount=defaultAppsMount;
		blacklight.publicMount=defaultPublicMount;

		sites.forEach((site)=>{
			//  Normalize appsMount, publicMount, baseUri
			var siteConfig = config[site];
			var appProperty = site + ".appsMount";
			var pubProperty = site + ".publicMount";

			_.set(config, appProperty, normalizePath(_.get(config,appProperty)), defaultAppsMount);
			_.set(config, pubProperty, normalizePath(_.get(config,pubProperty)), defaultPublicMount);

			if(siteConfig.slingBasePath){siteConfig.slingBasePath = ("/" + siteConfig.slingBasePath.trim("/") + "/")}

			var slings = _.get(config, site + ".hosts");
			_.each(slings,(host,key)=>{
				var sling=host.sling;
				if(!sling.baseUri){throw new Error("Missing baseUri in sling configuration: " + site + ".hosts." + key + ".sling");}
				sling.baseUri = sling.baseUri.replace(/\/$/,"");
			})

		});

		config.get("environment"); // Invoke a "get" call, just to make the config immutable.


	}





	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.loadModules = function(){
		initializeTo("loadModules");

		/// Instantiate sling connectors for all sites
		_.each(blacklight.sites, (siteObject, site)=>{
			var slingConfigs = _.get(blacklight.config[site], "hosts"), defaultConfig;
			if(slingConfigs){
				var defaultConfigBuilder = _.get(siteObject, "helpers.slingConfig");
				if(defaultConfigBuilder){defaultConfig=defaultConfigBuilder()}
			}
		});

		blacklight.modules = blacklight.moduleLoader({siteConnections: blacklight.sites, defaultSite: blacklight.defaultSite});


		// You should probably just remove the slingConnectors from the module configuration, and force all modules to load sling connection via req.
		// actually, send in all sling connectors, and let the module loader determine which ones to send through.

	}




	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.addRoutes = function(){
		initializeTo("addRoutes");
		var requestPreprocessors=[];

		// forEach site that actually has vhost definitions, create an app, and attach it to the blacklight.sites object
		// then launch on all listenable ports with a virtual host handler at the top.

		// each site definition now needs to include a "primaryContentPath" (/content/fourseasons)  and "hostRegex"
			// (these can be auto-generated by inference, but also overridden by user)


		_.each(blacklight.sites, (siteObject, site)=>{
			var siteConfig = _.get(config, site);
			var siteEnvironment = _.get(config, site + ".environment");
			var siteHelpers = _.get(siteObject, "helpers", {});
			var hosts = _.get(siteConfig, "hosts");

			if(!hosts){return;}

			var app = express();
			app.disable('x-powered-by');


			var blacklightProxy = _.get(blacklight.blacklightProxy, site);
			if(blacklightProxy && siteConfig.environment.blacklightProxy){
				console.log("Launching site '" + site + "' via blacklight proxy to", siteConfig.environment.blacklightProxy);
				app.all( siteConfig.appsMount + "*", blacklightProxy.appsProxy());
				app.all( siteConfig.publicMount + "img-opt/*", blacklightProxy.appsProxy());

				var slingBaseRegex = "^/content/" + site + "/";
				if(siteConfig.slingBasePath){slingBaseRegex="^" + slingBaseRegex;}

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

				if(siteHelpers.preprocessors){
					requestPreprocessors = siteHelpers.preprocessors({modules: blacklight.modules})
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
			


			// Add 404 status if accessing a path that contains "/404" in it
			app.use(
				function(req,res,next){
					if(~req.path.indexOf("/404")){res.status(404);}
					next();
				}
			);


			var componentPaths = blacklight.buildComponentRoots(siteConfig.componentRoots);

			// Configure and inject Blacklight handler
			app.use(
		    blacklight.express({
				publicRoot: _path.resolve(options.appRoot, "public") ,
				componentPaths: componentPaths,  
				componentCacheClearOnChange: config.environment.componentCacheClearOnChange,
				componentCacheDisable: config.environment.componentCacheDisable,
				utilities: blacklight.modules.modelHelpers,
				language: siteConfig.language,
				translationMethod: siteHelpers.staticTranslation ? siteHelpers.staticTranslation(siteConfig.language) : ()=>{"Translation not installed";},
				postProcessOptions:{minifyHTML:!config.environment.devMode, beautifyHTML:true},

				// TODO: config for emailError or not: the mechanism below needs replacement
				emailError: (config.environment.devMode&&0)?function(opt){global.bl.logger.get("email.error").error("---------\nWould be sending email error: " + opt.subject + "\n" + opt.text)}:blacklight.emailError,
				environmentName: config.environment.environmentName,
				requestPreprocessors: requestPreprocessors,
				skipModelProcessors: config.fshr.templateOnlyProxy?true:false
			}));

			siteObject.app = app;
		});


	
	}





	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.buildServer = function(){
		initializeTo("buildServer");

		// TODO: You need to decide precedence between hostname, port, and x-sling-source header.
		//        what if there is a mismatch between two or more of those?  who wins?  defaultSite?

		// virtual host:   https://github.com/tommymessbauer/express-vhost

		// Need site + sling-source. So go through the following until you have both:
		// 	hostname
		// 	x-sling-source
		// 	port

		// Hostname ambiguity not allowed.  i.e. hostname defs must each point to a single site + sling-source: no dupes
				// publish is allowed to have a * in name, but author cannot.  
				// shouldn't there be a "site-wide" domain, not tied to a partiular connection?  from that, auto-gen author hostname (if not explicitly defined)
				// spit out a warning if you find a browsable site with no domain which is not the default
		// x-sling-source can be dotted: fshr.author
		// how to determine if port spec is unambiguous?  have a port lookup table.  returns {site:, slingSource:} object
		// if still ambiguous: fill in blanks with  defaultSite + publish


		// build hostname table
		// build port table
		// return lookup function which goes through tables, and x-sling-source, and picks the siteApp

		// HOST dictionary key:  can either be  "*.something.specific"  or  "something.exactly.specific"
		/// "www.fourseasons.com", *.fourseasons.com"  "*.fs.local"  ["*.stage.fourseasons.com","www.fourseasons.com"]



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
						c.white("\n\t" + settings.site + ".hosts." + settings.mode + "\n\n") );
					throw new Error("Configuration problem: duplicate vhost entry '" + vhost + "' for [" + scId + "]")
				}
				hostLookup[vhost] = settings;
			}

			_.each(siteConfig.hosts, (host, mode)=>{
				var currentVhost = _.assign({mode:mode, sling: new SlingConnector(host.sling)}, baseSettings);
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

			});


			_.each(portLookup, (portApp, port)=>{
				var vhost="*:"+port;
				hostLookup[vhost]=null;
				addVhost("*", port, portApp);
			})

			// iterate over all hostLookup entries, and compare with all siteLookup entries.  
			// And then make sure all siteLookup entries have a vhost

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
					console.log(c.magenta("\nWARNING:"), c.blue(msg), c.white(site) + "\n", c.blue("        To connect, add a unique hostname and/or port for this `hosts` entry in your configuration file."));
				}
			})

			console.log();

			// {site:, , app:, sling:, runMode:, config}

		});
	}

	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.listen = function(){
		initializeTo("listen");


		var servers=[];
		var log=global.bl.logger.get("blacklight-render.startup");
		var server;


		function resolveVhost(req, res, next){
			var port = req.socket.localPort;
			var host = req.headers.host;
			if (trustForwardedHostHeader && req.headers["x-forwarded-host"]) {
				host = req.headers["x-forwarded-host"];
			}


			if (host){
				host = host.split(':')[0];
			}else{
				host="*";
			}

			host = host + ":" + port;

			var server = hostLookup[host];
			if (!server){
				host = "*" + host.substr(host.indexOf("."));
				server = hostLookup[host];
				hostLookup[host]=server;   // Auto-include this vhost entry into the lookup table.  TODO: infinitely variable wildcards + maliciousness could overfill this table.
			}
			if (!server){
				host = "*:" + port;
				server = hostLookup[host];
				hostLookup[host]=server;   // Auto-include this vhost entry into the lookup table.  TODO: infinitely variable wildcards + maliciousness could overfill this table.
			} 
			if(!server){
				return next();
			}else{
				if (typeof server.app === "function"){
					req.sling={sling: server.sling, mode: server.mode, site: server.site, config: config[server.site]};
					return server.app(req, res, next);
				}else{
					var msg="Bad/unexpected server app found when looking up vhost: " + host ;
					console.log(c.red("ERROR:"), c.white(msg + "\n"), server)
					throw new Error(msg)
				}
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
	function loadPlugins(loader){
		var desiredPlugins=[];
		try{require(desiredPlugins=require(_path.join(options.appRoot,"config/plugins.json")));}catch(err){}
		desiredPlugins.forEach((pluginId)=>{
			var plugin=loader(pluginId);
			if(!plugin){return;}
			if(pluginCategories.indexOf(plugin.category)<0){throw new Error("Plugin '" + pluginId + "' specifies invalid category '" + plugin.category + "'. Must be one of: " + pluginCategories.join(", "));}
			if(!_.isFunction(plugin)){throw new Error("Plugin '" + pluginId + "' main module export must be a function, but is not.");}
			plugin.name = pluginId;
			blacklight.plugins[plugin.category] = plugin;
		});
	}

	/**********************************************************************************/
	/**********************************************************************************/
	blacklight.pluginConfigHelper = function(site){
		var computedSite = site || blacklight.defaultSite;
		var $={
			site:site, 
			config:config,
			siteConfig:config[computedSite],
			siteObject:blacklight.sites[computedSite],
			getEnv: (property, defaults)=>{
				defaults = defaults || {};
				var propertyPath = "environment." + property;
				var val=_.get(config[site], propertyPath, _.get(config, propertyPath));
				if(typeof val === "object"){
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



