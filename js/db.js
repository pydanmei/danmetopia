// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, push, update, remove, onValue, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDQk9DlMNKwn_508fDMI_3IB_dgpgHujA",
  authDomain: "danmetopia.firebaseapp.com",
  projectId: "danmetopia",
  databaseURL: "https://danmetopia-default-rtdb.asia-southeast1.firebasedatabase.app/",
  storageBucket: "danmetopia.appspot.com",
  messagingSenderId: "178240377870",
  appId: "1:178240377870:web:d094b222ebabadccc5585f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// IMGBB API Key
const IMGBB_API_KEY = "d16b5595d7f6044476d254c8f428cc28";

// Admin emails
const ADMIN_EMAILS = ["pydanmeii@gmail.com", "pepyl4298@gmail.com", "maihuong4298@gmail.com"];

// Genre list
const GENRE_LIST = [
  { name: "3D", icon: "🎮", desc: "Truyện được vẽ bằng đồ họa 3D" },
  { name: "Action", icon: "⚔️", desc: "Truyện có nhiều cảnh đánh nhau, hành động" },
  { name: "Bara/Muscle", icon: "💪", desc: "Truyện về cơ bắp, nam tính" },
  { name: "Biography", icon: "📖", desc: "Truyện tiểu sử, dựa trên nhân vật có thật" },
  { name: "Cakeverse", icon: "🎂", desc: "Thể loại đặc biệt liên quan đến bánh kem" },
  { name: "Comedy", icon: "😂", desc: "Truyện hài hước, mang lại tiếng cười" },
  { name: "Crime", icon: "🔫", desc: "Truyện về tội phạm, xã hội đen" },
  { name: "Documentary", icon: "🎥", desc: "Truyện dạng phim tài liệu" },
  { name: "Dom/Sub verse", icon: "⛓️", desc: "Truyện có yếu tố thống trị/phục tùng" },
  { name: "Drama", icon: "💗", desc: "Truyện tình cảm, nhiều cung bậc cảm xúc" },
  { name: "Family", icon: "👨‍👩‍👧", desc: "Truyện về gia đình, tình thân" },
  { name: "Fantasy", icon: "🐉", desc: "Truyện giả tưởng, ma thuật, thế giới khác" },
  { name: "Furry", icon: "🐾", desc: "Truyện thú nhân hóa" },
  { name: "HET/Hentai", icon: "🔞", desc: "Truyện dị tính có yếu tố 18+" },
  { name: "Historical", icon: "🏯", desc: "Truyện cổ trang, lịch sử" },
  { name: "Horror", icon: "👻", desc: "Truyện kinh dị, rùng rợn" },
  { name: "Music", icon: "🎵", desc: "Truyện về âm nhạc, ca hát" },
  { name: "Mystery", icon: "🔍", desc: "Truyện trinh thám, bí ẩn, phá án" },
  { name: "Omegaverse", icon: "🔥", desc: "Truyện ABO (Alpha/Beta/Omega)" },
  { name: "Psychological", icon: "🧠", desc: "Truyện tâm lý, có chiều sâu nội tâm" },
  { name: "Romance", icon: "💕", desc: "Truyện tập trung vào tình cảm lãng mạn" },
  { name: "School Life", icon: "📚", desc: "Truyện bối cảnh trường học, học đường" },
  { name: "Sci-fi", icon: "🚀", desc: "Truyện khoa học viễn tưởng" },
  { name: "Shounen Ai", icon: "💖", desc: "Truyện BL nhẹ nhàng, thuần khiết" },
  { name: "Slice of Life", icon: "🌿", desc: "Truyện đời thường, nhẹ nhàng" },
  { name: "Sports", icon: "⚽", desc: "Truyện về thể thao, thi đấu" },
  { name: "Supernatural", icon: "👻", desc: "Truyện siêu nhiên" },
  { name: "Thriller", icon: "🔪", desc: "Truyện gây cấn, hồi hộp" },
  { name: "Tragedy", icon: "💔", desc: "Truyện bi kịch, buồn" },
  { name: "War", icon: "🏆", desc: "Truyện về chiến tranh" },
  { name: "Wuxia", icon: "🗡️", desc: "Truyện võ hiệp Trung Quốc" },
  { name: "Yaoi", icon: "🔥", desc: "Truyện BL có yếu tố 18+" },
  { name: "Yuri", icon: "💕", desc: "Truyện GL (girl love)" }
];

export { 
  app, auth, db, 
  IMGBB_API_KEY, ADMIN_EMAILS, GENRE_LIST,
  ref, set, get, child, push, update, remove, onValue, off
};
