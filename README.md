# Metatags (Web audit Module)

Metatags module for web_audit.

[New] Provides a hn structure validator.


## Install
1. Install with your favorite package manager
2. Add the module in your web-audit.config.js 
```
export const config = {
	modules: [
        ...
        'node_modules/web-audit-module-metatags/src/modules/MetatagsModule.js',
        'node_modules/web-audit-module-metatags/src/modules/StructureHnModule.js',
    ],
},
```