const { authenticate } = require('passport')
const bcrypt = require('bcryptjs')

const LocalStrategy = require('passport-local').Strategy

function initialize(passport , getUserByUsername, getUserByID){
    const authenticateUser = async(USERNAME, PASSWORD, done) => {
        const user = await getUserByUsername(USERNAME)
        if(user == null){
            return done(null, false, {message: 'No user with that username'})
        }
        try{
            if(await bcrypt.compare(PASSWORD, user.password)) {
                return done(null, user)
            }else{
                return done(null, false, {message: 'Password incorrect'})
            }
        }catch (e){
            return done(e)
        }
    }
    passport.use(new LocalStrategy({usernameField: 'USERNAME',passwordField: 'PASSWORD'},
    authenticateUser))
    passport.serializeUser((user, done) => {
        // Hanapin ang ID key kahit ano pa ang case (id, ID, Id)
        const idKey = Object.keys(user).find(key => key.toUpperCase() === 'ID');
        done(null, user[idKey]);
    })
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await getUserByID(id)
            return done(null, user)
        } catch (e) {
            return done(e)
        }
    })
}

module.exports = initialize