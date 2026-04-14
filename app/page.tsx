'use client';

import { useState, useEffect } from 'react';
import { Music, Clock, Play, Check, ExternalLink, Send, Inbox, Settings } from 'lucide-react';
import { createClient } from '@/lib/supabase';

interface SongInfo {
  title: string;
  artist: string;
  artwork?: string;
  originalLink: string;
  links: {
    spotify?: string;
    appleMusic?: string;
    youtubeMusic?: string;
  };
}

interface SearchResult {
  title: string;
  artist: string;
  artwork?: string;
  appleLink: string;
}

interface Share {
  id: number;
  song_title: string;
  song_artist: string;
  artwork?: string | null;
  original_link?: string | null;
  spotify_link?: string | null;
  apple_music_link?: string | null;
  youtube_music_link?: string | null;
  shared_by: string;
  recipients: string[];
  created_at: string;
}

interface Profile {
  id: string;
  email: string;
  preferred_platform?: string;
  selected?: boolean;
}

export default function CrewTunes() {
  const [songInput, setSongInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSong, setCurrentSong] = useState<SongInfo | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [myPreferredPlatform, setMyPreferredPlatform] = useState('spotify');
  const [showSettings, setShowSettings] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadUserProfile();
      loadAllUsers();
      fetchHistory();
    }
  }, [user]);

  const loadUserProfile = async () => {
    const { data } = await supabase.from('profiles').select('preferred_platform').eq('id', user.id).single();
    if (data?.preferred_platform) setMyPreferredPlatform(data.preferred_platform);
  };

  const loadAllUsers = async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase.from('profiles').select('id, email, preferred_platform').neq('id', user.id);
    if (error) console.error(error);
    else {
      const usersWithSelection = (data || []).map(u => ({ ...u, selected: false }));
      setAllUsers(usersWithSelection);
    }
    setLoadingUsers(false);
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    const { data, error } = await supabase.from('shares').select('*').order('created_at', { ascending: false });
    if (error) console.error('History fetch error:', error);
    else setShares(data || []);
    setLoadingHistory(false);
  };

  const savePreferredPlatform = async (platform: string) => {
    setMyPreferredPlatform(platform);
    await supabase.from('profiles').update({ preferred_platform: platform }).eq('id', user.id);
  };

  const changePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) alert(error.message);
    else {
      alert("Password changed successfully!");
      setNewPassword('');
      setShowSettings(false);
    }
  };

  const handleSearch = async () => {
    if (!songInput.trim()) return;
    setIsLoading(true);
    setSearchResults([]);
    setCurrentSong(null);

    try {
      if (songInput.startsWith('http')) {
        const song = await fetchSongFromOdesli(songInput);
        if (song) setCurrentSong(song);
      } else {
        const res = await fetch(`/api/search?term=${encodeURIComponent(songInput)}`);
        if (!res.ok) throw new Error('Search request failed');
        const data = await res.json();

        if (data.results && data.results.length > 0) {
          setSearchResults(data.results.map((item: any) => ({
            title: item.trackName,
            artist: item.artistName,
            artwork: item.artworkUrl100?.replace('100x100', '300x300'),
            appleLink: item.trackViewUrl,
          })));
        } else {
          alert("No songs found. Try a different search term.");
        }
      }
    } catch (err) {
      console.error("Search error:", err);
      alert("Search failed. Please try again.");
    }
    setIsLoading(false);
  };

  const selectSong = async (result: SearchResult) => {
    setIsLoading(true);
    let song = await fetchSongFromOdesli(result.appleLink);

    if (!song) {
      song = {
        title: result.title,
        artist: result.artist,
        artwork: result.artwork,
        originalLink: result.appleLink,
        links: { appleMusic: result.appleLink },
      };
    }

    setIsLoading(false);
    setCurrentSong(song);
    setSearchResults([]);
  };

  const fetchSongFromOdesli = async (urlOrQuery: string): Promise<SongInfo | null> => {
    try {
      const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(urlOrQuery)}`);
      if (!res.ok) return null;
      const data = await res.json();
      const entity = data.entitiesByUniqueId?.[data.entityUniqueId];
      if (!entity) return null;

      return {
        title: entity.title || 'Unknown Title',
        artist: entity.artistName || 'Unknown Artist',
        artwork: entity.thumbnailUrl || entity.imageUrl,
        originalLink: data.pageUrl || urlOrQuery,
        links: {
          spotify: data.linksByPlatform?.spotify?.url,
          appleMusic: data.linksByPlatform?.appleMusic?.url,
          youtubeMusic: data.linksByPlatform?.youtubeMusic?.url,
        },
      };
    } catch {
      return null;
    }
  };

  const toggleUser = (id: string) => {
    setAllUsers(prev => prev.map(u => u.id === id ? { ...u, selected: !u.selected } : u));
  };

  const selectedUsers = allUsers.filter(u => u.selected === true);

  const handleShare = async (song: SongInfo) => {
    if (selectedUsers.length === 0) {
      alert("Please select at least one user.");
      return;
    }

    const recipientEmails = selectedUsers.map(u => u.email);

    const newShare = {
      song_title: song.title,
      song_artist: song.artist,
      artwork: song.artwork || null,
      original_link: song.originalLink || null,
      spotify_link: song.links.spotify || null,
      apple_music_link: song.links.appleMusic || null,
      youtube_music_link: song.links.youtubeMusic || null,
      shared_by: user.email,
      recipients: recipientEmails,
    };

    const { error } = await supabase.from('shares').insert(newShare);

    if (error) {
      alert(`Failed to save: ${error.message}`);
    } else {
      // Force refresh after share
      await fetchHistory();
      setCurrentSong(null);
      setSongInput('');
      setSearchResults([]);
      alert(`✅ Shared successfully!`);
    }
  };

  const getPlatformLink = (share: Share) => {
    switch (myPreferredPlatform) {
      case 'spotify': return share.spotify_link || share.original_link || '#';
      case 'appleMusic': return share.apple_music_link || share.original_link || '#';
      case 'youtubeMusic': return share.youtube_music_link || share.original_link || '#';
      default: return share.original_link || '#';
    }
  };

  // Case-insensitive filtering
  const receivedShares = shares.filter(share => 
    share.recipients.some(r => r.toLowerCase() === (user?.email || '').toLowerCase())
  );

  const sentShares = shares.filter(share => 
    share.shared_by.toLowerCase() === (user?.email || '').toLowerCase()
  );

  const handleLogin = async () => {
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else setShowAuthModal(false);
    setAuthLoading(false);
  };

  const handleSignup = async () => {
    setAuthLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setAuthLoading(false);
    if (error) alert(error.message);
    else alert("Account created! Please log in.");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-12">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-lg border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
              <Music className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tighter">CrewTunes</h1>
              <p className="text-zinc-400 text-sm">Private music for the crew</p>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-zinc-800 rounded-xl">
                <Settings className="w-5 h-5" />
              </button>
              <span className="text-sm text-zinc-300">{user.email}</span>
              <button onClick={() => supabase.auth.signOut()} className="px-4 py-2 bg-zinc-900 hover:bg-red-950 rounded-2xl text-sm transition">
                Logout
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAuthModal(true)} className="px-6 py-2 bg-white text-black rounded-2xl font-medium hover:bg-zinc-200">
              Log in / Sign up
            </button>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && user && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-3xl p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6">Settings</h2>
            
            <div className="mb-6">
              <p className="text-sm text-zinc-400 mb-2">Change password</p>
              <input
                type="password"
                placeholder="New password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-2xl px-5 py-3 mb-4"
              />
              <button
                onClick={changePassword}
                disabled={changingPassword || !newPassword}
                className="w-full bg-violet-600 py-3 rounded-2xl font-semibold disabled:opacity-50"
              >
                {changingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>

            <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-white block mx-auto">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-3xl p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-center">
              {authMode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-2xl px-5 py-3 mb-4" />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-2xl px-5 py-3 mb-6" />

            <button onClick={authMode === 'login' ? handleLogin : handleSignup} disabled={authLoading} className="w-full bg-violet-600 py-4 rounded-2xl font-semibold mb-4 disabled:opacity-50">
              {authLoading ? 'Processing...' : authMode === 'login' ? 'Log In' : 'Sign Up'}
            </button>

            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-sm text-zinc-400 hover:text-white block mx-auto">
              {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Log in"}
            </button>
          </div>
        </div>
      )}

      {user ? (
        <div className="max-w-2xl mx-auto px-6 pt-8">
          {/* Preferred Platform */}
          <div className="mb-8 bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6">
            <p className="text-sm text-zinc-400 mb-3">My preferred platform:</p>
            <div className="flex gap-3">
              {['spotify', 'appleMusic', 'youtubeMusic'].map((p) => (
                <button
                  key={p}
                  onClick={() => savePreferredPlatform(p)}
                  className={`px-6 py-3 rounded-2xl border transition-all ${
                    myPreferredPlatform === p ? 'border-violet-500 bg-violet-950/50 text-white' : 'border-zinc-700 hover:border-zinc-600 bg-zinc-950'
                  }`}
                >
                  {p === 'spotify' && 'Spotify'}
                  {p === 'appleMusic' && 'Apple Music'}
                  {p === 'youtubeMusic' && 'YouTube Music'}
                </button>
              ))}
            </div>
          </div>

          {/* Share a song */}
          <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 mb-12">
            <h2 className="text-2xl font-semibold mb-1">Share a song</h2>
            <p className="text-zinc-400 mb-6">Search by song + artist or paste link</p>

            <div className="flex gap-3 mb-8">
              <input
                type="text"
                value={songInput}
                onChange={(e) => setSongInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Watermelon Sugar Harry Styles"
                className="flex-1 bg-zinc-950 border border-zinc-700 focus:border-violet-500 rounded-2xl px-6 py-4 text-lg placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                onClick={handleSearch}
                disabled={isLoading || !songInput.trim()}
                className="bg-white text-black px-10 rounded-2xl font-semibold hover:bg-zinc-200 transition disabled:opacity-50"
              >
                {isLoading ? 'Searching...' : 'Search'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mb-10">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-zinc-400">Choose the right song:</p>
                  <button onClick={() => setSearchResults([])} className="text-zinc-400 hover:text-white">Clear</button>
                </div>
                <div className="grid grid-cols-1 gap-4 max-h-[420px] overflow-y-auto">
                  {searchResults.map((result, i) => (
                    <button
                      key={i}
                      onClick={() => selectSong(result)}
                      className="flex gap-5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-violet-500 rounded-2xl p-4 text-left transition-all active:scale-95"
                    >
                      {result.artwork && <img src={result.artwork} className="w-20 h-20 rounded-xl object-cover" />}
                      <div>
                        <p className="font-semibold">{result.title}</p>
                        <p className="text-zinc-400">{result.artist}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentSong && (
              <>
                <div className="mb-8">
                  <p className="text-sm text-zinc-400 mb-4">Share with:</p>
                  {loadingUsers ? (
                    <p className="text-zinc-500">Loading users...</p>
                  ) : allUsers.length === 0 ? (
                    <p className="text-zinc-500">No other users found yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {allUsers.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => toggleUser(u.id)}
                          className={`flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all ${
                            u.selected ? 'border-violet-500 bg-violet-950/50 text-white' : 'border-zinc-700 hover:border-zinc-600 bg-zinc-950'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${u.selected ? 'border-violet-500 bg-violet-500' : 'border-zinc-600'}`}>
                            {u.selected && <Check className="w-3.5 h-3.5 text-black" />}
                          </div>
                          <div className="font-medium">{u.email}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-zinc-950 border border-zinc-700 rounded-3xl p-8">
                  <div className="flex gap-8">
                    {currentSong.artwork && <img src={currentSong.artwork} className="w-52 h-52 rounded-2xl object-cover" />}
                    <div>
                      <h3 className="text-4xl font-bold">{currentSong.title}</h3>
                      <p className="text-2xl text-zinc-400 mt-2">{currentSong.artist}</p>
                    </div>
                  </div>

                  <div className="mt-8 border-t border-zinc-800 pt-6">
                    <button
                      onClick={() => handleShare(currentSong)}
                      disabled={selectedUsers.length === 0}
                      className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 py-5 rounded-2xl font-semibold text-lg disabled:opacity-50"
                    >
                      Share with {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Two Tabs */}
          <div>
            <div className="flex border-b border-zinc-800 mb-6">
              <button
                onClick={() => setActiveTab('received')}
                className={`flex-1 py-4 text-center font-medium border-b-2 transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'received' ? 'border-violet-500 text-white' : 'border-transparent text-zinc-400'
                }`}
              >
                <Inbox className="w-5 h-5" />
                Received
              </button>
              <button
                onClick={() => setActiveTab('sent')}
                className={`flex-1 py-4 text-center font-medium border-b-2 transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'sent' ? 'border-violet-500 text-white' : 'border-transparent text-zinc-400'
                }`}
              >
                <Send className="w-5 h-5" />
                Sent
              </button>
            </div>

            {loadingHistory ? (
              <p className="text-center py-12 text-zinc-500">Loading...</p>
            ) : (
              <>
                {activeTab === 'received' && (
                  <>
                    <h2 className="text-2xl font-semibold mb-6 flex items-center gap-3">
                      <Clock className="w-6 h-6 text-violet-400" /> Songs Shared With Me
                    </h2>
                    {receivedShares.length === 0 ? (
                      <p className="text-center py-12 text-zinc-500">No songs shared with you yet.</p>
                    ) : (
                      <div className="space-y-8">
                        {receivedShares.map((share) => {
                          const link = getPlatformLink(share);
                          const isUniversal = link.includes('song.link') || link.includes('odesli');
                          const platformName = myPreferredPlatform === 'spotify' ? 'Spotify' : myPreferredPlatform === 'appleMusic' ? 'Apple Music' : 'YouTube Music';

                          return (
                            <div key={share.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-7">
                              <div className="flex gap-6">
                                {share.artwork && <img src={share.artwork} className="w-28 h-28 rounded-2xl object-cover" />}
                                <div className="flex-1">
                                  <p className="text-2xl font-semibold">{share.song_title}</p>
                                  <p className="text-zinc-400">{share.song_artist}</p>
                                  <p className="text-xs text-zinc-500 mt-4">
                                    From {share.shared_by} • {new Date(share.created_at).toLocaleDateString('en-GB')}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-8">
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-center gap-2 px-8 py-4 bg-green-600 hover:bg-green-500 rounded-2xl text-white font-medium transition w-full"
                                >
                                  <Play className="w-5 h-5" />
                                  Open in {platformName}
                                </a>
                                {isUniversal && (
                                  <p className="text-center text-xs text-amber-400 mt-3 flex items-center justify-center gap-1">
                                    <ExternalLink className="w-3 h-3" />
                                    Opens song.link page — tap {platformName} there
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'sent' && (
                  <>
                    <h2 className="text-2xl font-semibold mb-6 flex items-center gap-3">
                      <Send className="w-6 h-6 text-violet-400" /> Songs I Shared
                    </h2>
                    {sentShares.length === 0 ? (
                      <p className="text-center py-12 text-zinc-500">You haven't shared any songs yet.</p>
                    ) : (
                      <div className="space-y-8">
                        {sentShares.map((share) => (
                          <div key={share.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-7">
                            <div className="flex gap-6">
                              {share.artwork && <img src={share.artwork} className="w-28 h-28 rounded-2xl object-cover" />}
                              <div className="flex-1">
                                <p className="text-2xl font-semibold">{share.song_title}</p>
                                <p className="text-zinc-400">{share.song_artist}</p>
                                <p className="text-xs text-zinc-500 mt-2">
                                  Shared with: <span className="font-medium text-white">{share.recipients.join(', ')}</span>
                                </p>
                                <p className="text-xs text-zinc-500 mt-1">
                                  {new Date(share.created_at).toLocaleDateString('en-GB')}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center pt-40 px-6">
          <h2 className="text-5xl font-bold mb-4">CrewTunes</h2>
          <p className="text-xl text-zinc-400">Log in to start sharing music with your crew.</p>
        </div>
      )}
    </div>
  );
}