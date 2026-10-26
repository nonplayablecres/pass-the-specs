import { useState } from 'react';

// Shows public/examples/<id>.jpg if you've added one.
export default function Photo({ id }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return <div className="photo">Add an example photo for this check at<br />public/examples/{id}.jpg</div>;
  }
  return (
    <div className="photo">
      <img src={`./examples/${id}.jpg`} alt="Example of what to look for" onError={() => setMissing(true)} />
    </div>
  );
}
