import React, { useState, useEffect } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import SortableTask from "./SortableTask";
import TaskForm from "./TaskForm";
import axios from "axios";
import "./App.css"; // CSSでTrello風スタイル

export interface Task {
  id: number;
  title: string;
  summary?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  owner?: string;
  assignee?: string;
  reward?: number;
  position: number;
  column_id: number;
}

interface Column {
  id: number;
  title: string;
  position: number;
  tasks: Task[];
}

interface Board {
  id: number;
  title: string;
  columns: Column[];
}

const API_BASE = "http://localhost:8000";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJleHAiOjE3NTYxODQ3MDh9.0XdaDEfhjHgud_exrmfTabrE5Vh7iPCC0aK6Ur7cxCo";

export default function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");

  const sensors = useSensors(useSensor(PointerSensor));

  // WebSocketでリアルタイム更新
  useEffect(() => {
    if (!board) return;
    const ws = new WebSocket(`${API_BASE.replace("http","ws")}/ws/boards/${board.id}?token=${TOKEN}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (!board) return;

      switch (msg.type) {
        case "task_created":
          setBoard(b => ({
            ...b!,
            columns: b!.columns.map(c => c.id === msg.task.column_id ? { ...c, tasks: [...c.tasks, msg.task] } : c)
          }));
          break;
        case "task_updated":
          setBoard(b => ({
            ...b!,
            columns: b!.columns.map(c => ({ ...c, tasks: c.tasks.map(t => t.id===msg.task.id ? msg.task : t) }))
          }));
          break;
        case "task_deleted":
          setBoard(b => ({
            ...b!,
            columns: b!.columns.map(c => c.id===msg.column_id ? { ...c, tasks: c.tasks.filter(t=>t.id!==msg.task_id) } : c)
          }));
          break;
        case "column_created":
          setBoard(b => ({ ...b!, columns: [...b!.columns, msg.column] }));
          break;
        case "column_deleted":
          setBoard(b => ({ ...b!, columns: b!.columns.filter(c=>c.id!==msg.column_id) }));
          break;
      }
    };
    return () => ws.close();
  }, [board]);

  // 初期ロード
  useEffect(() => {
    axios.get(`${API_BASE}/boards/1/full`, { headers: { Authorization: `Bearer ${TOKEN}` } })
      .then(res => {
        const b = res.data; 
        b.columns = b.columns || []; 
        setBoard(b);
      }).catch(console.error);
  }, []);

  const handleAddColumn = () => {
    if (!board || !newColumnTitle) return;
    axios.post(`${API_BASE}/boards/${board.id}/columns`, { title: newColumnTitle }, { headers: { Authorization: `Bearer ${TOKEN}` } })
      .then(()=>setNewColumnTitle(""));
  };

  const handleDeleteColumn = (columnId: number) => {
    if (!board) return;
    axios.delete(`${API_BASE}/boards/${board.id}/columns/${columnId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    setBoard({ ...board, columns: board.columns.filter(c=>c.id!==columnId) });
  };

  const handleAddTask = (columnId: number, task: Omit<Task,"id"|"position">) => {
    axios.post(`${API_BASE}/columns/${columnId}/tasks`, task, { headers: { Authorization: `Bearer ${TOKEN}` } });
  };

  const handleUpdateTask = (taskId: number, task: Partial<Task>) => {
    axios.put(`${API_BASE}/tasks/${taskId}`, task, { headers: { Authorization: `Bearer ${TOKEN}` } });
  };

  const handleDeleteTask = (taskId: number, columnId: number) => {
    axios.delete(`${API_BASE}/tasks/${taskId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  };

  const handleDragEnd = (column: Column, activeId: number, overId: number | null) => {
    if (!overId || activeId===overId || !board) return;
    const newTasks = arrayMove(column.tasks, column.tasks.findIndex(t=>t.id===activeId), column.tasks.findIndex(t=>t.id===overId));
    setBoard({ ...board, columns: board.columns.map(c=>c.id===column.id ? {...c, tasks:newTasks} : c) });
    axios.post(`${API_BASE}/tasks/reorder`, {
      board_id: board.id,
      columns: board.columns.map(c=>({ id:c.id, task_ids:c.tasks.map(t=>t.id) }))
    }, { headers: { Authorization: `Bearer ${TOKEN}` } });
  };

  if (!board) return <div>Loading...</div>;

  return (
    <div className="board-container">
      <h1>{board.title}</h1>
      <div className="columns-wrapper">
        {board.columns.map(col=>(
          <div className="column" key={col.id}>
            <div className="column-header">
              <h3>{col.title}</h3>
              <button className="delete-column" onClick={()=>handleDeleteColumn(col.id)}>🗑</button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter}>
              <SortableContext items={col.tasks.map(t=>t.id)} strategy={verticalListSortingStrategy}>
                {col.tasks?.map(task=>(
                  <SortableTask
                    key={task.id}
                    task={task}
                    onDragEnd={(a,o)=>handleDragEnd(col,a,o)}
                    onUpdate={(updated)=>handleUpdateTask(task.id, updated)}
                    onDelete={()=>handleDeleteTask(task.id, col.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <TaskForm columnId={col.id} onAddTask={handleAddTask} />
          </div>
        ))}
        <div className="column-add">
          <input type="text" placeholder="Add new column" value={newColumnTitle} onChange={e=>setNewColumnTitle(e.target.value)} />
          <button onClick={handleAddColumn}>Add Column</button>
        </div>
      </div>
    </div>
  );
}
