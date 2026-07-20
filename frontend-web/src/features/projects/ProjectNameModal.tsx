import { useState } from 'react';
import { Icon } from '../../core/Icon';

interface Props {
  title: string; // "New project" | "Rename project"
  initialName?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function ProjectNameModal({ title, initialName = '', onSubmit, onClose }: Props) {
  const [name, setName] = useState(initialName);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim());
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <input
            className="text-field"
            placeholder="Project name (e.g. ZIFRIEND)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoFocus
          />
          <button className="generate-btn" disabled={!name.trim()} onClick={submit}>
            {title}
          </button>
        </div>
      </div>
    </div>
  );
}
