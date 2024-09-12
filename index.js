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

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    const packageCollection = client.db('employeeDB').collection('package')
    const requestedAssetCollection = client.db('employeeDB').collection('requestedAsset')


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


    // =================
    // ----hrs-------
    // =================
    app.get('/hrs/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      // Ensure the request is authenticated and email matches
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const query = { email: email };
      const user = await hrCollection.findOne(query);

      if (user && user.identity === 'hr') {
        // Check if the HR has a 'paid' status
        if (user.status === 'paid') {
          res.send({ ...user, message: 'HR is paid' });
        } else {
          res.send({ ...user, message: 'HR is not paid' });
        }
      } else {
        res.status(404).send({ message: 'HR not found or user is not an HR' });
      }
    });



    // getting hr collection for employee array 

    app.get('/my-team/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const data = await hrCollection.findOne(query);
      const members = data.employees;
      res.send(members);
    })



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


    // update an status 
    app.patch('/hrs/:id', async (req, res) => {
      const id = req.params.id;
      const {paidAmount}=req.body
      const filter = { _id: new ObjectId(id) };
      const updatedStatus = {
        $set: {
          status: 'paid',
          amount:paidAmount,
        }
      };
      try {
        const result = await hrCollection.updateOne(filter, updatedStatus);
        res.send({ modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Error updating status:", error);
        res.status(500).send("An error occurred while updating the status.");
      }
    });



    // Route to remove an employee from hrCollection

    app.delete('/hrs/remove-employee/:hrEmail/:employeeId', async (req, res) => {
      const { hrEmail, employeeId } = req.params;


      const filter = { email: hrEmail };
      const update = {
        $pull: { employees: { _id: new ObjectId(employeeId) } } // Remove the employee with the specific ID
      };
      const result = await hrCollection.updateOne(filter, update);
      res.send(result);

    });



    // updating the employees in employees array in hr collection and status update in employee collection

    app.post('/add-employees-to-hr', verifyToken, verifyHr, async (req, res) => {
      const { employeeIds, logo } = req.body;
      const hrEmail = req.decoded.email;

      try {
        // Step 1: Find employee details by their IDs
        const employees = await employeeCollection.find({
          _id: { $in: employeeIds.map(id => new ObjectId(id)) }
        }).toArray();

        // Step 2: Update the status of selected employees to 'affiliated' and hrEmail
        const filter = { _id: { $in: employeeIds.map(id => new ObjectId(id)) } };
        const update = {
          $set: {
            status: 'affiliated',
            hrEmail: hrEmail,
            logo: logo,
          }
        };
        await employeeCollection.updateMany(filter, update);

        // Step 3: Prepare the employees array for the HR collection with id, name, and email
        const employeeDetails = employees.map(employee => ({
          _id: employee._id,
          name: employee.name,
          email: employee.email,
          photo: employee.photo
        }));

        // Step 4: Add the detailed employee objects to HR's employees array
        const hrFilter = { email: hrEmail };
        const hrUpdate = { $addToSet: { employees: { $each: employeeDetails } } };
        const hrResult = await hrCollection.updateOne(hrFilter, hrUpdate);

        res.send({ message: 'Employees added successfully and status updated', hrResult });
      } catch (error) {
        console.error('Error adding employees:', error);
        res.status(500).send({ message: 'Error adding employees or updating status', error });
      }
    });


    // update hr profile 
    app.patch('/profile-update/:id', async (req, res) => {
      const id = req.params.id;
      const { name } = req.body; // Extract name from the request body
      const query = { _id: new ObjectId(id) };
      const updatedProfile = {
          $set: {
              name: name // Set the name directly
          }
      };
      const result = await hrCollection.updateOne(query, updatedProfile);
      res.send(result);
  });
  

    // =================
    // ----hrs-------
    // =================


    // =================
    // ----employees-------
    // =================

    // getting employees for useAffiliated hook 

    app.get('/employees/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      // Ensure the request is authenticated and email matches
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const query = { email: email };
      const user = await employeeCollection.findOne(query);

      res.send(user);


    });





    // getting not affiliated employees
    app.get('/employees', async (req, res) => {
      const query = { status: { $ne: 'affiliated' } };
      const result = await employeeCollection.find(query).toArray();
      res.send(result);
    })


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

    // update employee profile 
    app.patch('/employee-profile-update/:id', async (req, res) => {
      const id = req.params.id;
      const { name } = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedProfile = {
          $set: {
              name: name 
          }
      };
      const result = await employeeCollection.updateOne(query, updatedProfile);
      res.send(result);
  });


    // =================
    // ----employees-------
    // =================



    // =================
    // ----Asset-------
    // =================
    // for asset list 
    app.get('/assets', verifyToken, verifyHr, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await assetCollection.find(query).toArray();
      res.send(result);
    });

    // getting asset for update 
    app.get('/assets/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await assetCollection.findOne(query);
      res.send(result);
    })



    // sending asset in database 
    app.post('/assets', verifyToken, verifyHr, async (req, res) => {
      const asset = req.body;
      const result = await assetCollection.insertOne(asset);
      res.send(result);
    });


    // delete an asset from asset list 
    app.delete('/assets/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await assetCollection.deleteOne(query);
      res.send(result);
    });

    // update an asset 
    app.patch('/assets/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedAsset = {
        $set: {
          name: item.name,
          quantity: item.quantity,
          type: item.type,
        }
      };
      try {
        const result = await assetCollection.updateOne(filter, updatedAsset);
        res.send({ modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Error updating asset:", error);
        res.status(500).send("An error occurred while updating the asset.");
      }
    });


    // getting assets for request for an asset 

    app.get('/for-request/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const result = await assetCollection.find(query).toArray();
      res.send(result);
    })


    // getting requested assets for all requested (hr)
    app.get('/requested-asset/:email', async (req, res) => {
      const email = req.params.email;
      const query = { hrEmail: email };
      const result = await requestedAssetCollection.find(query).toArray();
      res.send(result);
    });


    // Route to handle asset request
    app.post('/requested-asset', async (req, res) => {

      const requesterInfo = req.body;
      const result = await requestedAssetCollection.insertOne(requesterInfo);
      res.send(result);

    });

    // reject a request 

    app.delete('/requested-asset/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await requestedAssetCollection.deleteOne(query);
      res.send(result);
    })

    // approve a request 

    app.patch('/requested-asset/:id', async (req, res) => {
      const id = req.params.id;
      const approvalDate = req.body.approvalDate;
      const query = { _id: new ObjectId(id) };
      const updatedStatus = {
        $set: {
          status: 'approved',
          approvalDate: approvalDate,


        }
      };
      const result = await requestedAssetCollection.updateOne(query, updatedStatus);
      res.send(result);
    })

    // my requested for employee  updating return status 

    app.patch('/my-requested-asset/:id', async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const updatedStatus = {
        $set: {
          status: 'returned',
        }
      };
      const result = await requestedAssetCollection.updateOne(query, updatedStatus);
      res.send(result);
    })

    // my requested for employee

    app.get('/my-requested-asset/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await requestedAssetCollection.find(query).toArray();
      res.send(result);
    });



    // my asset for employee

    app.get('/my-asset/:email', async (req, res) => {
      const email = req.params.email;
      const query = {
        email: email,
        status: 'approved'
      }
      const result = await requestedAssetCollection.find(query).toArray();
      res.send(result);
    });


    // for employee home|| my pending requests
    app.get('/employee-requests/pending/:email', async (req, res) => {
      const email = req.params.email;
      const query = {
        email: email,
        status: 'pending'
      };
      const result = await requestedAssetCollection.find(query).toArray();
      res.send(result);
    });

    // for employee home|| my monthly requests

    app.get('/employee-requests/month/:email', async (req, res) => {
      const email = req.params.email;
      const { month } = req.query;

      const query = {
        email: email,
        month: parseInt(month)  // Ensure month is an integer
      };
      const result = await requestedAssetCollection.find(query).toArray();
      res.send(result);

    });


    // for hr home||  pending requests
    app.get('/hr-home/pending/:email', async (req, res) => {
      const email = req.params.email;
      const query = {
        hrEmail: email,
        status: 'pending'
      };

      const result = await requestedAssetCollection.find(query).limit(5).toArray();
      res.send(result);
    });


    // for hr home||  top most requested 
    app.get('/top-requested-assets/:hrEmail', async (req, res) => {
      const hrEmail = req.params.hrEmail;

      try {
        const result = await requestedAssetCollection.aggregate([
          {
            $match: { hrEmail: hrEmail }
          },
          {
            $group: {
              _id: "$asset",
              count: { $sum: 1 }
            }
          },
          {
            $sort: { count: -1 }
          },
          {
            $limit: 4
          }
        ]).toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: 'An error occurred while fetching top requested assets.' });
      }
    });


    // for hr home||  limited stock items 

    app.get('/limited-stock-items/:hrEmail', async (req, res) => {
      const hrEmail = req.params.hrEmail;

      const result = await assetCollection.find({
        email: hrEmail,
        quantity: { $lt: 10 }
      }).toArray();

      res.send(result);

    });


    // for hr home||  pie chart 
    
    app.get('/asset-type-count/:hrEmail', async (req, res) => {
      const hrEmail = req.params.hrEmail;
    
      const result = await assetCollection.aggregate([
        {
          $match: { email: hrEmail }  
        },
        {
          $group: {
            _id: "$type",          
            count: { $sum: 1 }      
          }
        }
      ]).toArray();
    
      res.send(result);
    });
    


    // =================
    // ----Asset-------
    // =================




    // =================
    // ----packages-------
    // =================
    // 
    // getting subscription 
    app.get('/subscriptions', async (req, res) => {
      const result = await packageCollection.find().toArray();
      res.send(result);
    });

    // getting packages for sending price 
    app.get('/subscriptions/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await packageCollection.findOne(query);
      res.send(result);
    })


    // =================
    // ----packages-------
    // =================

    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, 'amount inside the intent')

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });

    // 



    // --------------------- older code -------------------------------------
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
