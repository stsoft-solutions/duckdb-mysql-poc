'use strict';

import config from 'config';
import Load from 'config/util.js';

config.util.setModuleDefaults('source_db', {
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    user: 'admin'
});
Load.
/**
 * @typedef {Object} SourceDbOptions
 * @property {string} host
 * @property {number} port
 * @property {string} database
 * @property {string} user
 * @property {string} [password]
 */

/**
 * @type {SourceDbOptions}
 */
const dbOptions = config.get('source_db');


console.log(dbOptions.database);
console.log(dbOptions.user);

