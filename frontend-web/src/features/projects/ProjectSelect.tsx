import { useEffect, useState } from 'react';
import { Icon } from '../../core/Icon';
import { useToast } from '../../core/toast';
import type { Project } from '../../core/types';
import { ProjectNameModal } from './ProjectNameModal';
import { addProject, listProjects } from './projectRepo';

const ACTIVE_KEY = 'greyvetro-active-project';

export function activeProjectId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

interface Props {
  /** Called with the current target project on mount and whenever it changes (null = Unsorted). */
  onChange?: (projectId: string | null, projectName: string) => void;
}

/** "Project: <name> ▾" selector for the composer — the save target for generated takes. */
export function ProjectSelect({ onChange }: Props) {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(activeProjectId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    listProjects().then((list) => {
      setProjects(list);
      const stored = activeProjectId();
      const current = list.find((p) => p.id === stored);
      // Active project may have been deleted from the Gallery tab.
      if (stored && !current) select(null);
      else onChange?.(stored, current?.name ?? 'Unsorted');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (id: string | null, name?: string) => {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
    setActiveId(id);
    setMenuOpen(false);
    onChange?.(id, name ?? (id ? projects.find((p) => p.id === id)?.name ?? 'Project' : 'Unsorted'));
  };

  const openMenu = async () => {
    if (!menuOpen) setProjects(await listProjects());
    setMenuOpen((o) => !o);
  };

  const create = async (name: string) => {
    const project = await addProject(name);
    setProjects((list) => [...list, project]);
    select(project.id, project.name);
    toast(`Project “${project.name}” created.`);
  };

  const activeName = projects.find((p) => p.id === activeId)?.name ?? 'Unsorted';

  return (
    <div className="project-select">
      <span className="project-label">Project</span>
      <div className="preset-menu-anchor">
        <button className="chip" onClick={openMenu}>
          <Icon name="folder" /> {activeName} <Icon name="expand_more" />
        </button>
        {menuOpen && (
          <div className="preset-menu left">
            <button className="preset-menu-item" onClick={() => select(null)}>
              <span className="pname">Unsorted</span>
            </button>
            {projects.map((p) => (
              <button key={p.id} className="preset-menu-item" onClick={() => select(p.id)}>
                <span className="pname">{p.name}</span>
              </button>
            ))}
            <button
              className="preset-menu-item"
              onClick={() => {
                setMenuOpen(false);
                setCreateOpen(true);
              }}
            >
              <span className="pname">
                <Icon name="add" /> New project
              </span>
            </button>
          </div>
        )}
      </div>

      {createOpen && (
        <ProjectNameModal
          title="New project"
          onSubmit={create}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
