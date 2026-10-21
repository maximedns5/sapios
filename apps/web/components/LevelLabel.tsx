// Bodoni en grand corps a un « + » au filet presque invisible : on le compose en coupe de petit corps.
export default function LevelLabel({ label }: { label: string }) {
  const i = label.indexOf("+");
  if (i === -1) return <>{label}</>;
  return (
    <>
      {label.slice(0, i)}
      <span className="plus">+</span>
      {label.slice(i + 1)}
    </>
  );
}
