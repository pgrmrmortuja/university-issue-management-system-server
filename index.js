const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const port = process.env.PORT || 5000;

var admin = require("firebase-admin");
var serviceAccount = require("./firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// middleware
app.use(cors());
app.use(express.json());
// app.use(requestIp.mw()); // to get IP address


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dk8ve.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri);

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("universityDB").collection("users");
    const issueCollection = client.db("universityDB").collection("issues");
    const likeCollection = client.db("universityDB").collection("likes");
    const savedCollection = client.db("universityDB").collection("saves");


    //jwt related-----------------------

    // Login API (JWT Token Create)
    app.post("/login", async (req, res) => {
      const { email } = req.body;
      const user = await userCollection.findOne({ email });

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // JWT Token Making (email + role)
      const token = jwt.sign({ email, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "12h" });

      res.json({ token });
    });




    //middleware---------------------------

    const verifyJWT = (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(403).json({ message: "Unauthorized access: No token provided" });
      }

      const token = authHeader.split(" ")[1]; // "Bearer token" থেকে শুধু টোকেন নিন

      console.log("Received Token:", token);

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          console.error("JWT Verification Error:", err.message);
          return res.status(403).json({ message: "Invalid token" });
        }

        req.user = decoded; // টোকেন ডিকোড করে ইউজারের তথ্য সেভ করুন
        next();
      });
    };


    // Role-Based Middleware-----------------------------

    // Admin Middleware
    const verifyAdmin = async (req, res, next) => {
      const user = await userCollection.findOne({ email: req.user.email });

      if (user?.role !== "Admin") {
        return res.status(403).json({ message: "Access Denied: Admins only!" });
      }
      next();
    };

    // User Middleware
    const verifyUser = async (req, res, next) => {
      const user = await userCollection.findOne({ email: req.user.email });

      if (user?.role !== "User") {
        return res.status(403).json({ message: "Access Denied: Users only!" });
      }
      next();
    };

    //Admin or User middleware
    const verifyAdminOrUser = async (req, res, next) => {
      const user = await userCollection.findOne({ email: req.user.email });

      if (user?.role === "Admin" || user?.role === "User") {
        return next();
      }

      return res.status(403).json({ message: "Access Denied: Only Admin or User can perform this action!" });
    };





    //user related api---------------------------

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // //ToDo
    // app.get('/user-email/:email', async (req, res) => {
    //   const email = req.params.email;
    //   const filter = { email: email };
    //   const result = await userCollection.find(filter).toArray();
    //   res.send(result);
    // })

    app.get('/user-email/:email', async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await userCollection.findOne(filter);
      res.send([result]); // Array আকারে পাঠালে তোমার frontend-এর userInfo[0] ঠিকভাবে কাজ করবে
    });



    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });


    app.patch('/user-role/:id', async (req, res) => {
      const id = req.params.id;
      const { role } = req.body; // Verified, Rejected, Fraud etc.
      const filter = { _id: new ObjectId(id) };

      const updatedDoc = {
        $set: {
          role: role
        }
      };

      const result = await userCollection.updateOne(filter, updatedDoc);


      if (role === "Fraud") {

        const user = await userCollection.findOne(filter);
        if (user?.email) {
          const propertyFilter = { agent_email: user.email };
          const deleteResult = await propertyCollection.deleteMany(propertyFilter);
          console.log(`Deleted ${deleteResult.deletedCount} properties for Fraud agent.`);

          return res.send({
            modifiedCount: result.modifiedCount,
            deletedProperties: deleteResult.deletedCount
          });

        }
      }

      res.send(result);
    });


    app.delete("/remove-user/:id", async (req, res) => {
      const id = req.params.id;
      const uid = req.query.uid; // Query থেকে uid নিন

      if (!uid) {
        return res.status(400).json({ error: "Invalid UID" });
      }

      try {

        const query = { _id: new ObjectId(id) };
        const result = await userCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "User not found in DB!" });
        }

        await admin.auth().deleteUser(uid);

        res.json({ success: true, message: "User deleted from MongoDB & Firebase!" });

      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ error: "Failed to delete user" });
      }
    });


    //issue related api------------------------------------

    app.get('/get-issues', async (req, res) => {
      const result = await issueCollection.find().toArray();
      res.send(result);
    });

    app.get("/my-issues/:email", async (req, res) => {
      const student_email = req.params.email;
      const query = { student_email };
      const result = await issueCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/issue-id/:id', async (req, res) => {
      const issue_id = req.params.id;
      const query = { _id: new ObjectId(issue_id) };
      const result = await issueCollection.findOne(query);
      res.send(result);
    })

    app.post("/issues", async (req, res) => {
      const issue = req.body;
      const result = await issueCollection.insertOne(issue);
      res.send(result);
    });

    app.put('/update-issue/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const update = req.body;
      const issue = {
        $set: {
          student_name: update.student_name,
          student_email: update.student_email,
          student_image: update.student_image,
          issue_title: update.issue_title,
          issue_category: update.issue_category,
          issue_location: update.issue_location,
          issue_date: update.issue_date,
          issue_time: update.issue_time,
          issue_details: update.issue_details,
          verification_status: update.verification_status,
          issue_image: update.issue_image,
          submit_date: update.submit_date,
        }

      }

      const result = await issueCollection.updateOne(filter, issue, options);
      res.send(result);
    })

    app.patch('/verification/:id', async (req, res) => {
      const id = req.params.id;
      const { verification_status } = req.body; // Verified or Rejected
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          verification_status: verification_status
        }
      }

      const result = await issueCollection.updateOne(filter, updatedDoc);
      res.send(result);

    });

    app.delete('/delete-issue/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issueCollection.deleteOne(query);
      res.send(result);
    })


    //like related api-----------------------------------
    







    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('University Issue Management Server is running here')
})

app.listen(port, () => {
  console.log(`University Issue Management Server is looked on port ${port}`);
})