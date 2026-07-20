import { Menu } from '@greyvetro/ui';

export function ProjectMenu() {
  return (
    <div style={{ position: 'relative', width: 220, height: 210 }}>
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <Menu
          items={[
            { label: 'Product launch', sublabel: '6 clips', current: true },
            { label: 'Onboarding series', sublabel: '3 clips' },
            { label: 'New project…' },
            { label: 'Delete project', danger: true },
          ]}
        />
      </div>
    </div>
  );
}
