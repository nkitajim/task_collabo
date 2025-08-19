import React, { useState } from "react";
import { Task } from "./App";

interface Props {
  columnId: number;
  onAddTask: (columnId: number, task: Omit<Task,"id"|"position">) => void;
}

export default function TaskForm({ columnId, onAddTask }: Props) {
  const [task, setTask] = useState<Omit<Task,"id"|"position">>({
    title:"", summary:"", description:"", start_date:"", end_date:"", owner:"", assignee:"", reward:0, column_id: columnId
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!task.title) return;
    onAddTask(columnId, task);
    setTask({ ...task, title:"", summary:"", description:"", start_date:"", end_date:"", owner:"", assignee:"", reward:0 });
  };

  return (
    <form onSubmit={handleSubmit} className="task-form">
      <input placeholder="Title" value={task.title} onChange={e=>setTask({...task,title:e.target.value})} required />
      <input placeholder="Summary" value={task.summary} onChange={e=>setTask({...task,summary:e.target.value})} />
      <textarea placeholder="Description" value={task.description} onChange={e=>setTask({...task,description:e.target.value})} />
      <input type="date" value={task.start_date} onChange={e=>setTask({...task,start_date:e.target.value})} />
      <input type="date" value={task.end_date} onChange={e=>setTask({...task,end_date:e.target.value})} />
      <input placeholder="Owner" value={task.owner} onChange={e=>setTask({...task,owner:e.target.value})} />
      <input placeholder="Assignee" value={task.assignee} onChange={e=>setTask({...task,assignee:e.target.value})} />
      <input type="number" placeholder="Reward" value={task.reward} onChange={e=>setTask({...task,reward:Number(e.target.value)})} />
      <button type="submit">Add Task</button>
    </form>
  );
}

