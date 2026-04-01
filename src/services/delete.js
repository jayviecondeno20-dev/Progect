const connection = require('../database/connection.js');
const db = require('../database/connection.js')

module.exports = async (id)=>{
    try{
        const query = `DELETE FROM accounts WHERE id = ${id}`;
        await connection(query)
        return true

    }catch(err){
        console.error("Database Error:", err)
        return false
    }
}