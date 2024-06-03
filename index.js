const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()

const app = express();
const port = process.env.PORT || 5000;



// middleWire

app.use(cors());
app.use(express.json());



// ---------------database------------------




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qtepxet.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)




    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }


    console.log("Pinged your deployment. You successfully connected to MongoDB!");
} 

run().catch(console.dir);







// --------------database-------------------




app.get('/', (req, res) => {
    res.send('server is runnig')
})

app.listen(port, () => {
    console.log(`server is running in port: ${port}`)
})