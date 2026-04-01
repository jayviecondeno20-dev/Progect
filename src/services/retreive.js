const connection = require('../database/connection.js');
const db = require('../database/connection.js'); 

module.exports = async (Fields) => {
    try {
        const query = `SELECT ${Fields} FROM inventory`;
        // Dahil ang connection.js mo ay nag-eexport na ng query function:
        const result = await db(query); 
        return result; 
    } catch (err) {
        console.error("Retreive error:", err);
        return [];
    }
}