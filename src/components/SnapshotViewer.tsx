import React from 'react';

interface SnapshotViewerProps {
  snapshots: string[];
}

function SnapshotViewer({ snapshots }: SnapshotViewerProps) {
  return (
    <div
      className="snapshot-viewer"
      style={{ padding: '10px', overflowY: 'auto', height: '100%' }}
    >
      <h2>Snapshots</h2>
      {snapshots.length === 0 ? (
        <p>No snapshots taken yet.</p>
      ) : (
        snapshots.map((snapshot) => (
          <div key={snapshot} style={{ marginBottom: '10px' }}>
            <img
              src={snapshot}
              alt={`Snapshot ${snapshot + 1}`}
              style={{ maxWidth: '100%', border: '1px solid #ccc' }}
            />
          </div>
        ))
      )}
    </div>
  );
}

export default SnapshotViewer;
