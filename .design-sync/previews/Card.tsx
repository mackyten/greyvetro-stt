import { Card } from '@greyvetro/ui';

export function Basic() {
  return (
    <div style={{ width: 320 }}>
      <Card title="Voice settings">
        <p style={{ margin: 0, color: 'var(--text)', fontSize: 13 }}>
          Tune stability, similarity, and style for the selected voice before generating.
        </p>
      </Card>
    </div>
  );
}

export function Plain() {
  return (
    <div style={{ width: 320 }}>
      <Card>
        <div style={{ fontWeight: 700, color: 'var(--heading)' }}>Intro — take 2</div>
        <div className="mono" style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
          0:42 · eleven_v3
        </div>
      </Card>
    </div>
  );
}
