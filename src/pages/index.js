import React from 'react';
import { useDropzone } from 'react-dropzone';

function HomePage() {
  const { getRootProps, getInputProps, open, acceptedFiles } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.png', '.jpg'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    onDropAccepted: (acceptedFiles) => {
      // Handle the accepted files here
      console.log(acceptedFiles); // For now, just log the files to the console
    },
    onDropRejected: (rejectedFiles) => {
      // Handle rejected files here (e.g., show an error message)
      console.log(rejectedFiles);
      alert("Invalid file type. Please upload a PDF or an image.");
    }
  });

  return (
    <div>
      <h1>Solar Sizing App</h1>
      <div {...getRootProps()} style={{ border: '2px dashed #ccc', padding: '20px', textAlign: 'center', cursor: 'pointer' }}>
        <input {...getInputProps()} />
        <p>Drag 'n' drop your electricity bill here, or click to select files</p>
        <button type="button" onClick={open}>
          Select Files
        </button>
      </div>
      <div>
        <p>Accepted files:</p>
        <ul>
          {acceptedFiles.map((file) => (
            <li key={file.path}>
              {file.path} - {file.size} bytes
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default HomePage;