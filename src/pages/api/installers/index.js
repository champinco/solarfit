import { MongoClient } from 'mongodb';

export default async function handler(req, res) {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();

  if (req.method === 'GET') {
    try {
      const { location, experience, rating } = req.query;
      let query = {};

      if (location) {
        query.location = { $regex: location, $options: 'i' };
      }
      if (experience) {
        query.yearsOfExperience = { $gte: parseInt(experience) };
      }
      if (rating) {
        query.rating = { $gte: parseFloat(rating) };
      }

      const installers = await db.collection('installers')
        .find(query)
        .sort({ rating: -1, yearsOfExperience: -1 })
        .toArray();

      res.status(200).json(installers);
    } catch (error) {
      console.error('Error fetching installers:', error);
      res.status(500).json({ message: 'Error fetching installers' });
    }
  } else if (req.method === 'POST') {
    try {
      const installer = req.body;
      const result = await db.collection('installers').insertOne(installer);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating installer:', error);
      res.status(500).json({ message: 'Error creating installer' });
    }
  }

  client.close();
} 