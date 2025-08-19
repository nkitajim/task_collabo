import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Task { id: number; title: string; description?: string; position: number; column_id: number; }
interface Props { task: Task; onDragEnd: (a:number,o:number|null)=>void; onUpdate: (title:string, desc?:string)=>void; onDelete: ()=>void; }

export default function SortableTask({ task, onUpdate, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description || "");

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging?0.5:1, padding:8, marginBottom:8, backgroundColor:"white", borderRadius:4, boxShadow:"0 1px 3px rgba(0,0,0,0.2)", cursor:"grab" };

  const handleSave = () => { onUpdate(title, desc); setEditing(false); };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {editing ? (
        <div>
          <input value={title} onChange={e=>setTitle(e.target.value)} style={{width:"100%", marginBottom:4}} />
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} style={{width:"100%", marginBottom:4}} />
          <button onClick={handleSave} style={{marginRight:4}}>Save</button>
          <button onClick={()=>setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div>
          <strong>{task.title}</strong>
          {task.description && <p style={{fontSize:12}}>{task.description}</p>}
          <div style={{display:"flex", justifyContent:"flex-end", gap:4}}>
            <button onClick={()=>setEditing(true)}>✏️</button>
            <button onClick={onDelete}>🗑</button>
          </div>
        </div>
      )}
    </div>
  );
}
