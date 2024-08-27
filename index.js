// ---------------
// basic
// ----------------



const express = require('express');
// ----------------------------- 1
const app = express();
// -----------------------------2
const cors = require('cors');
// ---------------------------3

require('dotenv').config();
// -------------------------8

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const port = process.env.PORT || 5000
// -------------------------------------4

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
// ---------------------
app.use(cors(corsOptions))
app.use(express.json())
// ------------------------5



// Verify Token Middleware


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qtepxet.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {

    const employeeCollection = client.db('employeeDB').collection('employee')
    const hrCollection = client.db('employeeDB').collection('hr')
    const assetCollection = client.db('employeeDB').collection('asset')


      // jwt related api
      app.post('/jwt', async (req, res) => {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
        res.send({ token });
      })

      // middlewares 
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }
    // use verify hr after verifyToken
    const verifyHr = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await hrCollection.findOne(query);
      const isAdmin = user?.identity === 'hr';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    // checking hr for is hr 
    app.get('/hrs/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
  
      if (email !== req.decoded.email) {
          return res.status(403).send({ message: 'forbidden access' });
      }
  
      const query = { email: email };
      const user = await hrCollection.findOne(query);
  
      if (user && user.identity === 'hr') {
          // If the user is an HR, send back the entire user object (or customize as needed)
          res.send(user);
      } else {
          // If the user is not found or not an HR, send a 404 or appropriate message
          res.status(404).send({ message: 'HR not found or user is not an HR' });
      }
  });
  

    //sending hr in data base 
    app.post('/hrs', async (req, res) => {
      const hr = req.body;
      // insert email if user doesnt exists: 
      // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
      const query = { email: hr.email }
      const existingHr = await hrCollection.findOne(query);
      if (existingHr) {
        return res.send({ message: 'hr already exists', insertedId: null })
      }
      const result = await hrCollection.insertOne(hr);
      res.send(result);
    });


    //sending employee in data base 
    app.post('/employees', async (req, res) => {
      const employee = req.body;
      // insert email if user doesnt exists: 
      // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
      const query = { email: employee.email }
      const existingEmployee = await employeeCollection.findOne(query);
      if (existingEmployee) {
        return res.send({ message: 'employee already exists', insertedId: null })
      }
      const result = await employeeCollection.insertOne(employee);
      res.send(result);
    });


    // sending asset in database 
    app.post('/assets', async (req, res) => {
      const asset = req.body;
      const result = await assetCollection.insertOne(asset);
      res.send(result);
    });

    // --------------------- older code -------------------------------------
    // const assetCollection = client.db('assetDB').collection('asset')
    // const usersCollection = client.db('assetDB').collection('user')

    // save a user data in db
    // app.put('/user', async (req, res) => {
    //   const user = req.body
    //   const query = { email: user?.email }
    //   const options = { upsert: true }
    //   const updateDoc = {
    //     $set: {
    //       ...user,
    //       timestamp: Date.now(),
    //     },
    //   }
    //   const result = await usersCollection.updateOne(query, updateDoc, options)
    //   res.send(result)
    // })

    // Save an asset data in db
    // app.post('/asset', async (req, res) => {
    //   const assetData = req.body
    //   const result = await assetCollection.insertOne(assetData)
    //   res.send(result)
    // })

    // email query for asset list
    // app.get('/asset-lists/:email', async (req, res) => {
    //   console.log(req.params.email)
    //   console.log('tok tok token ', req.cookies)
    //   let query = {}
    //   if (req.query?.email) {
    //     query = { email: req.query.email }
    //   }
    //   const result = await assetCollection.find(query).toArray()
    //   res.send(result)
    // })

    // delete an asset
    // app.delete('/asset/:id', async (req, res) => {
    //   const id = req.params.id
    //   const query = { _id: new ObjectId(id) }
    //   const result = await assetCollection.deleteOne(query)
    //   res.send(result)
    // })

    // getting assets for update
    // app.get('/getting-assets/:id', async (req, res) => {
    //   const id = req.params.id
    //   const query = { _id: new ObjectId(id) }
    //   const result = await assetCollection.findOne(query)
    //   res.send(result)
    // })

    // update asset
    // app.put('/assets/:id', async (req, res) => {
    //   const id = req.params.id
    //   const filter = { _id: new ObjectId(id) }
    //   const update = {
    //     $set: {
    //       date: req.body.date,
    //       product: req.body.product,
    //       quantity: req.body.quantity,
    //       type: req.body.type,
    //     },
    //   }

    //   try {
    //     const result = await assetCollection.updateOne(filter, update)
    //     res.send(result)
    //   } catch (err) {
    //     console.error(err)
    //     res.status(500).send("Error updating booking.")
    //   }
    // })

    // auth related api
    // app.post('/jwt', async (req, res) => {
    //   const user = req.body
    //   const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    //     expiresIn: '365d',
    //   })
    //   res
    //     .cookie('token', token, {
    //       httpOnly: true,
    //       secure: process.env.NODE_ENV === 'production',
    //       sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    //     })
    //     .send({ success: true })
    // })

    // Logout
    // app.get('/logout', async (req, res) => {
    //   try {
    //     res
    //       .clearCookie('token', {
    //         maxAge: 0,
    //         secure: process.env.NODE_ENV === 'production',
    //         sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    //       })
    //       .send({ success: true })
    //     console.log('Logout successful')
    //   } catch (err) {
    //     res.status(500).send(err)
    //   }
    // })


    // --------------------- older code -------------------------------------

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from opti-Asset Server..')
})
// ---------------------------------------6

app.listen(port, () => {
  console.log(`opti-Asset is running on port ${port}`)
})
// -----------------------------------------------------7
