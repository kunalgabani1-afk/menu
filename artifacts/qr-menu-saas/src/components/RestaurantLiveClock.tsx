import React, { useState, useEffect } from "react";

interface RestaurantLiveClockProps {
  greeting?: string;
  className?: string;
}

export const RestaurantLiveClock = React.memo(function RestaurantLiveClock({
  greeting,
  className = "",
}: RestaurantLiveClockProps) {
  const [timeString, setTimeString] = useState<string>(() => formatCurrentTime());

  useEffect(() => {
    // Isolated clock timer: updates only this small text every 10 seconds without re-rendering parent
    const timer = setInterval(() => {
      setTimeString(formatCurrentTime());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  function formatCurrentTime(): string {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const date = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    return `${time} · ${date}`;
  }

  return (
    <div className={`text-[11.5px] text-stone-500 font-sans tracking-tight ${className}`}>
      {greeting ? <span>{greeting} · </span> : null}
      <span className="font-semibold text-stone-600 tabular-nums">{timeString}</span>
    </div>
  );
});

export default RestaurantLiveClock;
