Blacklight render example
=========================

This example demonstrates:
- Creation of component type registry
- Model generation against a raw Sling JSON file
- And rendering of that model using a very simple set of registered component types

Usage (For Mac ... the 'open' command may need tweaking on Linux/PC): 

	node index.js > /tmp/index.html
	open /tmp/index.html

For an exmaple of a component template, see files in `components/mycompany/pages/home-page/`.  In the `home-page.hbs` file, you'll see examples of the `{{component [path]}}` directive, which will look for a component at the specified path in the backing model.  If the component exists in the model, its `_sling_resourceType` will be used to find a template in the component type registry.  If the template file is found, it will be applied.  If not, Blacklight's default template will be applied, which recursively reveals the raw data in the backing model.

For an example of a component model processor, see `home-page.js` in the same folder.  This file is a module which exports two properties: `async`, which is set to true, to indicate this processor runs asynchronously, and `process`, a function which accepts the unaltered model and makes changes as needed.  In this case, the UUID meta data field is changed to contain a silly phrase.

