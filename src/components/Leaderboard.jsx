
export default function Leaderboard({scores}){
  return (
    <div className="leaderboard">
      <h3>Leaderboard</h3>
      {scores.map((s,i)=>(
        <div key={i} className="row">
          <span>{s.name}</span>
          <span>{s.wpm}</span>
        </div>
      ))}
    </div>
  )
}
