import React, { useState, useEffect } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import SortableTask from "./SortableTask";
import axios from "axios";

interface Task { id: number; title: string; description?: string; position: number; column_id: number; }
interface Column { id: number; title: string; position: number; tasks: Task[]; }
interface Board { id: number; title: string; columns: Column[]; }

const API_BASE = "http://localhost:8000";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJleHAiOjE3NTYxNzMwNjV9.T_ofWlNJeHjHhDQv6_2ZZmhDTipK8S2-JwS8HXr55WU";

export default function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");

  const sensors = useSensors(useSensor(PointerSensor));

  // WebSocket
  useEffect(() => {
    if (!board) return;
    const ws = new WebSocket(`${API_BASE.replace("http","ws")}/ws/boards/${board.id}?token=${TOKEN}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === "task_created") {
        setBoard((b) => {
          if (!b) return b;
          const newColumns = b.columns?.map(c => c.id === msg.task.column_id ? { ...c, tasks: [...c.tasks, msg.task] } : c) || [];
          return { ...b, columns: newColumns };
        });
      }

      if (msg.type === "task_updated") {
        setBoard((b) => {
          if (!b) return b;
          const newColumns = b.columns?.map(c => {
            return { ...c, tasks: c.tasks.map(t => t.id === msg.task.id ? msg.task : t) };
          }) || [];
          return { ...b, columns: newColumns };
        });
      }

      if (msg.type === "task_deleted") {
        setBoard((b) => {
          if (!b) return b;
          const newColumns = b.columns?.map(c => {
            if (c.id === msg.column_id) {
              return { ...c, tasks: c.tasks.filter(t => t.id !== msg.task_id) };
            }
            return c;
          }) || [];
          return { ...b, columns: newColumns };
        });
      }

      if (msg.type === "reorder") {
        const colsMap: Record<number, Column> = {};
        msg.data.columns.forEach((c: any) => {
          const col = board?.columns?.find(col => col.id === c.id);
          if (col) {
            const sortedTasks = c.task_ids.map((tid: number) => col.tasks.find(t => t.id === tid)).filter(Boolean);
            colsMap[c.id] = { ...col, tasks: sortedTasks as Task[] };
          }
        });
        setBoard((b) => {
          if (!b) return b;
          const newCols = b.columns?.map(c => colsMap[c.id] || c) || [];
          return { ...b, columns: newCols };
        });
      }

      if (msg.type === "column_created") {
        setBoard((b) => {
          if (!b) return b;
          const cols = b.columns || [];
          return { ...b, columns: [...cols, msg.column] };
        });
      }

      if (msg.type === "column_deleted") {
        setBoard((b) => {
          if (!b) return b;
          const newCols = b.columns?.filter(c => c.id !== msg.column_id) || [];
          return { ...b, columns: newCols };
        });
      }
    };
    return () => ws.close();
  }, [board]);

  // 初期ロード
  useEffect(() => {
    axios.get(`${API_BASE}/boards/1/full`, { headers: { Authorization: `Bearer ${TOKEN}` } })
      .then(res => { const b = res.data; b.columns = b.columns || []; setBoard(b); })
      .catch(console.error);
  }, []);

  const handleDragEnd = (column: Column, activeId: number, overId: number | null) => {
    if (!overId || activeId === overId || !board) return;

    const newTasks = arrayMove(column.tasks, column.tasks.findIndex(t => t.id === activeId), column.tasks.findIndex(t => t.id === overId));
    const newColumns = board.columns.map(c => c.id === column.id ? { ...c, tasks: newTasks } : c);
    setBoard({ ...board, columns: newColumns });

    axios.post(`${API_BASE}/tasks/reorder`, { board_id: board.id, columns: newColumns.map(c => ({ id: c.id, task_ids: c.tasks.map(t => t.id) })) }, { headers: { Authorization: `Bearer ${TOKEN}` } });
  };

  const handleAddTask = (columnId: number, title: string) => {
    if (!title) return;
    axios.post(`${API_BASE}/columns/${columnId}/tasks`, { title }, { headers: { Authorization: `Bearer ${TOKEN}` } });
  };

  const handleUpdateTask = (taskId: number, title: string, description?: string) => {
    axios.put(`${API_BASE}/tasks/${taskId}`, { title, description }, { headers: { Authorization: `Bearer ${TOKEN}` } });
  };

  const handleDeleteTask = (taskId: number, columnId: number) => {
    axios.delete(`${API_BASE}/tasks/${taskId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  };

  const handleAddColumn = () => {
    if (!newColumnTitle || !board) return;
    axios.post(`${API_BASE}/boards/${board.id}/columns`, { title: newColumnTitle }, { headers: { Authorization: `Bearer ${TOKEN}` } })
      .then(() => setNewColumnTitle(""));
  };

  const handleDeleteColumn = (columnId: number) => {
    if (!board) return;
    axios.delete(`${API_BASE}/boards/${board.id}/columns/${columnId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    setBoard({ ...board, columns: board.columns.filter(c => c.id !== columnId) });
  };

  if (!board) return <div>Loading...</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>{board.title}</h1>
      <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingTop: 16 }}>
        {board.columns.map((col) => (
          <div key={col.id} style={{ minWidth: 250, background: "#f0f0f0", borderRadius: 6, padding: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>{col.title}</h3>
              <button onClick={() => handleDeleteColumn(col.id)}>🗑</button>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter}>
              <SortableContext items={col.tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                {col.tasks?.map(task => (
                  <SortableTask key={task.id} task={task} onDragEnd={(a,o)=>handleDragEnd(col,a,o)}
                    onUpdate={(title, desc)=>handleUpdateTask(task.id, title, desc)}
                    onDelete={()=>handleDeleteTask(task.id, col.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <TaskForm columnId={col.id} onAddTask={handleAddTask} />
          </div>
        ))}

        <div style={{ minWidth: 250, padding: 8 }}>
          <input type="text" placeholder="Add new column" value={newColumnTitle} onChange={e=>setNewColumnTitle(e.target.value)} style={{ width: "100%", marginBottom: 8, padding: 4 }} />
          <button onClick={handleAddColumn} style={{ width: "100%" }}>Add Column</button>
        </div>
      </div>
    </div>
  );
}

// タスク追加フォーム
const TaskForm = ({ columnId, onAddTask }: { columnId: number; onAddTask: (colId: number, title: string) => void }) => {
  const [title, setTitle] = useState("");
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onAddTask(columnId, title); setTitle(""); };
  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 8 }}>
      <input type="text" placeholder="New task" value={title} onChange={e=>setTitle(e.target.value)} style={{ width: "100%", marginBottom: 4, padding: 4 }} />
      <button type="submit" style={{ width: "100%" }}>Add Task</button>
    </form>
  );
};

