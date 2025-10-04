const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();

//middleware
app.use(express.json());
app.use(cors());

app.get("/", (req, res) =>{
    res.send("The University Issue Management Server is Started");
})

app.listen(port, () =>{
    console.log(`The Server is Working on ${port} port`);
})