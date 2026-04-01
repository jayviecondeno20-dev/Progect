const connection = require('../database/connection.js');

module.exports = async (username, password, confirm_password, category)=>{
    try{
        const query = `INSERT INTO accounts VALUES (null, '${username}', '${password}', '${confirm_password}', '${category}')`;
        await connection(query)
        return true

    }catch(err){
        return false
    }
}