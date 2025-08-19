import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Task } from "./App";

interface Props {
  task: Task;
  onDragEnd: (activeId: number, overId: number | null) => void;
  onUpdate: (updated: Partial<Task>) => void;
  onDelete: () => void;
}

export default function SortableTask({ task, onUpdate, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(task);

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging?0.5:1 };

  const handleSave = () => {
    onUpdate(formData);
    setEditing(false);
  };

  return (
    <div className="task-card" ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {editing ? (
        <div>
          <input value={formData.title} onChange={e=>setFormData({...formData, title:e.target.value})} />
          <input value={formData.summary} onChange={e=>setFormData({...formData, summary:e.target.value})} />
          <textarea value={formData.description} onChange={e=>setFormData({...formData, description:e.target.value})} />
          <input type="date" value={formData.start_date?.slice(0,10)} onChange={e=>setFormData({...formData, start_date:e.target.value})} />
          <input type="date" value={formData.end_date?.slice(0,10)} onChange={e=>setFormData({...formData, end_date:e.target.value})} />
          <input placeholder="Owner" value={formData.owner} onChange={e=>setFormData({...formData, owner:e.target.value})} />
          <input placeholder="Assignee" value={formData.assignee} onChange={e=>setFormData({...formData, assignee:e.target.value})} />
          <input type="number" placeholder="Reward" value={formData.reward} onChange={e=>setFormData({...formData, reward:Number(e.target.value)})} />
          <button onClick={handleSave}>Save</button>
          <button onClick={()=>setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div>
          <strong>{task.title}</strong>
          <p>{task.summary}</p>
          <p>{task.description}</p>
          <p>Start: {task.start_date?.slice(0,10)} End: {task.end_date?.slice(0,10)}</p>
          <p>Owner: {task.owner} Assignee: {task.assignee}</p>
          <p>Reward: {task.reward}</p>
          <div className="task-actions">
            <button onClick={()=>setEditing(true)}>✏️</button>
            <button onClick={onDelete}>🗑</button>
          </div>
        </div>
      )}
    </div>
  );
}

