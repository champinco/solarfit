import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();

  try {
    const { email, password, companyName, location, phoneNumber } = req.body;

    // Check if installer already exists
    const existingInstaller = await db.collection('installers').findOne({ email });
    if (existingInstaller) {
      return res.status(400).json({ message: 'Installer already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new installer
    const newInstaller = {
      email,
      password: hashedPassword,
      companyName,
      location,
      phoneNumber,
      yearsOfExperience: 0,
      rating: 0,
      averageQuote: 0,
      services: [],
      certifications: [],
      createdAt: new Date(),
      isVerified: false,
    };

    const result = await db.collection('installers').insertOne(newInstaller);

    // Generate JWT token
    const token = jwt.sign(
      { id: result.insertedId, email, role: 'installer' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Installer registered successfully',
      token,
      installer: {
        _id: result.insertedId,
        email,
        companyName,
        location,
        phoneNumber,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering installer' });
  } finally {
    client.close();
  }
} 