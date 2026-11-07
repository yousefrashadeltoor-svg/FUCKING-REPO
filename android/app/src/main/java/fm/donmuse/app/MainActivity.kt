@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package fm.donmuse.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import fm.donmuse.app.data.DeviceMusic
import fm.donmuse.app.data.DeviceSong
import fm.donmuse.app.playback.PlaybackService
import kotlinx.coroutines.Dispatchers
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

private val Void = Color(0xFF030304)
private val Panel = Color(0xFF111114)
private val Accent = Color(0xFF1DB954)
private val Gold = Color(0xFFC9A24A)

class MainActivity : ComponentActivity() {
    private var controllerFuture: ListenableFuture<MediaController>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val token = SessionToken(this, android.content.ComponentName(this, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(this, token).buildAsync()

        setContent {
            MaterialTheme(colorScheme = darkColorScheme(background = Void, surface = Panel, primary = Accent, tertiary = Gold)) {
                DonMuseRoot()
            }
        }
    }

    override fun onDestroy() {
        controllerFuture?.let { MediaController.releaseFuture(it) }
        super.onDestroy()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DonMuseRoot() {
    val ctx = LocalContext.current
    var tab by remember { mutableStateOf(0) }
    var songs by remember { mutableStateOf<List<DeviceSong>>(emptyList()) }
    var quran by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var radio by remember { mutableStateOf<List<Triple<String, String, String>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { refresh(ctx) { s -> songs = s } }
    LaunchedEffect(Unit) {
        val perms = mutableListOf(Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.POST_NOTIFICATIONS)
        if (Build.VERSION.SDK_INT < 33) perms.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        permLauncher.launch(perms.toTypedArray())
        refresh(ctx) { s -> songs = s; loading = false }
        scope.launch {
            quran = withContext(Dispatchers.IO) { fetchQuran() }
            radio = withContext(Dispatchers.IO) { fetchRadio() }
        }
    }

    Scaffold(
        containerColor = Void,
        bottomBar = {
            NavigationBar(containerColor = Panel) {
                val items = listOf("Library" to Icons.Filled.LibraryMusic, "Quran" to Icons.Filled.MenuBook, "Radio" to Icons.Filled.Radio, "Player" to Icons.Filled.PlayCircle)
                items.forEachIndexed { i, (label, icon) ->
                    NavigationBarItem(
                        selected = tab == i, onClick = { tab = i },
                        icon = { Icon(icon, label) }, label = { Text(label, fontSize = 10.sp) }
                    )
                }
            }
        }
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().background(Void)) {
            Header()
            when (tab) {
                0 -> DeviceList(songs, loading)
                1 -> QuranList(quran)
                2 -> RadioList(radio)
                else -> PlayerPanel()
            }
        }
    }
}

@Composable
private fun Header() {
    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).background(Color.White, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
            Text("☹", fontSize = 20.sp, color = Color.Black)
        }
        Spacer(Modifier.width(10.dp))
        Column {
            Text("DON MUSE", color = Color.White, fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text("Music · Radio · TV · Offline", color = Color(0xFF6E6E76), fontSize = 10.sp)
        }
    }
}

@Composable
private fun DeviceList(songs: List<DeviceSong>, loading: Boolean) {
    if (loading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Accent) }
        return
    }
    if (songs.isEmpty()) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Text("No device audio found. Grant the music permission to browse your library.", color = Color(0xFF9A9AA2))
        }
        return
    }
    Text("Your device · ${songs.size} songs", color = Color(0xFF9A9AA2), fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
    LazyColumn(Modifier.fillMaxSize()) {
        items(songs.take(500)) { s ->
            ListItem(
                colors = ListItemDefaults.colors(containerColor = Void),
                headlineContent = { Text(s.title, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                supportingContent = { Text("${s.artist} · ${s.album}", color = Color(0xFF8A8A92), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                trailingContent = { Text(formatMs(s.durationMs), color = Color(0xFF6E6E76), fontSize = 11.sp) }
            )
        }
    }
}

@Composable
private fun QuranList(items: List<Pair<String, String>>) {
    if (items.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Loading reciters…", color = Color(0xFF9A9AA2)) }
        return
    }
    Text("القرآن الكريم · complete surahs", color = Gold, fontSize = 12.sp, modifier = Modifier.padding(16.dp))
    LazyColumn(Modifier.fillMaxSize()) {
        items(items) { (title, sub) ->
            ListItem(
                colors = ListItemDefaults.colors(containerColor = Void),
                headlineContent = { Text(title, color = Color(0xFFF3E6C4), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                supportingContent = { Text(sub, color = Color(0xFF8A8A92), maxLines = 1, overflow = TextOverflow.Ellipsis) }
            )
        }
    }
}

@Composable
private fun RadioList(items: List<Triple<String, String, String>>) {
    if (items.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Loading stations…", color = Color(0xFF9A9AA2)) }
        return
    }
    LazyColumn(Modifier.fillMaxSize()) {
        items(items) { (name, country, codec) ->
            ListItem(
                colors = ListItemDefaults.colors(containerColor = Void),
                headlineContent = { Text(name, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                supportingContent = { Text("$country · $codec", color = Color(0xFF8A8A92)) }
            )
        }
    }
}

@Composable
private fun PlayerPanel() {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f).background(Panel, RoundedCornerShape(24.dp)), contentAlignment = Alignment.Center) {
            Text("♪", fontSize = 64.sp, color = Accent)
        }
        Spacer(Modifier.height(16.dp))
        Text("DON MUSE player", color = Color.White, fontWeight = FontWeight.Bold)
        Text("Background playback + notification + widget controls", color = Color(0xFF8A8A92), fontSize = 12.sp)
    }
}

/* -------------------------------- helpers -------------------------------- */

private fun refresh(ctx: android.content.Context, done: (List<DeviceSong>) -> Unit) {
    Thread {
        val list = runCatching { DeviceMusic.scan(ctx) }.getOrDefault(emptyList())
        (ctx as? android.app.Activity)?.runOnUiThread { done(list) }
    }.start()
}

private fun formatMs(ms: Long): String {
    val total = ms / 1000
    return "%d:%02d".format(total / 60, total % 60)
}

private fun get(url: String): String {
    val c = URL(url).openConnection() as HttpURLConnection
    c.connectTimeout = 12000; c.readTimeout = 20000
    return c.inputStream.bufferedReader().use { it.readText() }
}

private fun fetchQuran(): List<Pair<String, String>> = runCatching {
    val root = JSONObject(get("${DonMuseApp.API_BASE}/api/quran"))
    val reciters = root.getJSONArray("reciters")
    val surahs = root.getJSONArray("surahs")
    val out = ArrayList<Pair<String, String>>()
    for (r in 0 until reciters.length()) {
        val rec = reciters.getJSONObject(r)
        if (!rec.optBoolean("isEgyptian")) continue
        for (s in 0 until minOf(surahs.length(), 20)) {
            val su = surahs.getJSONObject(s)
            out += ("سورة ${su.optString("ar")}" to "${rec.optString("name")} · ${su.optString("en")}")
        }
    }
    out
}.getOrDefault(emptyList())

private fun fetchRadio(): List<Triple<String, String, String>> = runCatching {
    val root = JSONObject(get("${DonMuseApp.API_BASE}/api/radio"))
    val egypt = root.optJSONArray("egypt") ?: JSONArray()
    val out = ArrayList<Triple<String, String, String>>()
    for (i in 0 until minOf(egypt.length(), 60)) {
        val s = egypt.getJSONObject(i)
        out += Triple(s.optString("name"), s.optString("country"), "${s.optString("codec")} ${s.optInt("bitrate")}k")
    }
    out
}.getOrDefault(emptyList())
