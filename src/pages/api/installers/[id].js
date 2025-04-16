import { MongoClient, ObjectId } from 'mongodb';

export default async function handler(req, res) {
  const { id } = req.query;
  
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid installer ID' });
  }

  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();

  try {
    const installer = await db.collection('installers').findOne({ 
      _id: new ObjectId(id) 
    });

    if (!installer) {
      return res.status(404).json({ message: 'Installer not found' });
    }

    // Remove sensitive information
    const { password, ...installerData } = installer;

    res.status(200).json(installerData);
  } catch (error) {
    console.error('Error fetching installer:', error);
    res.status(500).json({ message: 'Error fetching installer' });
  } finally {
    client.close();
  }
} 