const tasks = [
  {
    object: "МОЛ Шумен",
    type: "Пожароизвестяване",
    status: "Просрочено",
  },
  {
    object: "Склад Север",
    type: "Пожарогасители",
    status: "Днес",
  },
  {
    object: "Хотел Централ",
    type: "Спринклерна система",
    status: "Утре",
  },
];

export function TasksPanel() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-lg font-black">Задачи за деня</h2>
      <div className="mt-4 space-y-3">
        {tasks.map((task) => (
          <div
            key={task.object}
            className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 transition hover:border-orange-200 hover:bg-orange-50/50"
          >
            <div className="font-bold text-slate-900">{task.object}</div>
            <div className="mt-1 text-sm font-medium text-slate-500">{task.type}</div>
            <div className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-bold leading-none text-orange-700 ring-1 ring-orange-200">
              {task.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
