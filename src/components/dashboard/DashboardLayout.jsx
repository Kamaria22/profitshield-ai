import React from 'react';

export default function DashboardLayout({ left, center, right, bottom }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_minmax(0,2.5fr)_minmax(280px,1.5fr)]">
        <div>{left}</div>
        <div>{center}</div>
        <div>{right}</div>
      </div>
      {bottom}
    </div>
  );
}
