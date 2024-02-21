const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const userRouter = require('./routes/userRoute');
const adminRoutes = require('./routes/adminRoute')
const session = require('express-session')



const app = express(); // Define the Express app here



require('dotenv').config()

app.use(session({
    resave:false,
    saveUninitialized:true,
    secret:'topssecret',
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:24*60*60*1000
    },
}))

app.set('view engine', 'ejs');

app.use(express.static(path.join(__dirname, 'views')));
// app.use(express.static(path.join(__dirname,'views')))
app.use(express.static('public'));
// app.use(express.static('public/admin'))

const { parsed: config } = require('dotenv').config();
global.config = config;

mongoose.connect(config.CONNECTION_STRING, {
    dbName: 'shop'
})
    .then((data) => {
        console.log("DB Connected");
    })
    .catch((err) => {
        console.log(err);
});

app.use('/', userRouter);
app.use('/',adminRoutes)


app.listen(5050, () => {
    console.log('Server is running on port 5050');
});
