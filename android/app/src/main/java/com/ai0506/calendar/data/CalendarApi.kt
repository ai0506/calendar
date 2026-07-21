package com.ai0506.calendar.data

import android.content.Context
import com.ai0506.calendar.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query
import retrofit2.Retrofit
import retrofit2.http.DELETE
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Header
import retrofit2.http.PATCH
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.HttpUrl.Companion.toHttpUrl

interface CalendarApi {
    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): ApiEnvelope<AuthStatus>

    @POST("api/auth/logout")
    suspend fun logout(): ApiEnvelope<AuthStatus>

    @GET("api/auth/status")
    suspend fun authStatus(): ApiEnvelope<AuthStatus>

    @GET("api/events")
    suspend fun events(
        @Query("from") from: String,
        @Query("to") to: String,
    ): ApiEnvelope<List<CalendarEvent>>

    @POST("api/events")
    suspend fun createEvent(@Body body: CreateEventRequest): ApiEnvelope<CalendarEvent>

    @GET("api/events/{id}")
    suspend fun event(@Path("id") id: String): ApiEnvelope<CalendarEvent>

    @POST("api/event-series")
    suspend fun createEventSeries(@Body body: EventSeriesRequest): ApiEnvelope<EventSeriesSummary>

    @PATCH("api/event-series/{id}")
    suspend fun updateEventSeries(
        @Path("id") id: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: EventSeriesPatchRequest,
    ): ApiEnvelope<EventSeriesUpdateResult>

    @PUT("api/events/{id}")
    suspend fun updateEvent(@Path("id") id: String, @Body body: UpdateEventRequest): ApiEnvelope<CalendarEvent>

    @DELETE("api/events/{id}")
    suspend fun deleteEvent(@Path("id") id: String): ApiEnvelope<DeleteResult>

    @POST("api/event-series/{id}/exceptions")
    suspend fun skipSeriesOccurrence(@Path("id") id: String, @Body body: SeriesExceptionRequest): ApiEnvelope<SeriesException>

    @DELETE("api/event-series/{id}")
    suspend fun deleteEventSeries(@Path("id") id: String): ApiEnvelope<DeleteResult>

    @GET("api/deadlines")
    suspend fun deadlines(
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("include_completed") includeCompleted: Boolean = true,
    ): ApiEnvelope<List<Deadline>>

    @POST("api/deadlines")
    suspend fun createDeadline(@Body body: CreateDeadlineRequest): ApiEnvelope<Deadline>

    @GET("api/deadlines/{id}")
    suspend fun deadline(@Path("id") id: String): ApiEnvelope<Deadline>

    @PUT("api/deadlines/{id}")
    suspend fun updateDeadline(@Path("id") id: String, @Body body: UpdateDeadlineRequest): ApiEnvelope<Deadline>

    @DELETE("api/deadlines/{id}")
    suspend fun deleteDeadline(@Path("id") id: String): ApiEnvelope<DeleteResult>

    @POST("api/deadlines/{id}/complete")
    suspend fun completeDeadline(@Path("id") id: String): ApiEnvelope<Deadline>

    @POST("api/deadlines/{id}/reopen")
    suspend fun reopenDeadline(@Path("id") id: String): ApiEnvelope<Deadline>

    @GET("api/categories")
    suspend fun categories(): ApiEnvelope<List<Category>>

    @GET("api/tags")
    suspend fun tags(): ApiEnvelope<List<Tag>>

    @GET("api/category-tag-suggestions")
    suspend fun categoryTagSuggestions(): ApiEnvelope<Map<String, List<String>>>

    @GET("api/notifications")
    suspend fun notifications(
        @Query("include_read") includeRead: Boolean = true,
        @Query("limit") limit: Int = 50,
    ): ApiEnvelope<NotificationFeed>

    @PUT("api/notifications/{id}")
    suspend fun markNotificationRead(@Path("id") id: String): ApiEnvelope<ReadNotificationResult>

    @POST("api/notifications/read-all")
    suspend fun markAllNotificationsRead(): ApiEnvelope<ReadAllResult>
}

/** Cookie login is deliberately kept in the native HTTP client, never in an APK constant. */
class SessionCookieJar : CookieJar {
    private val cookies = mutableListOf<Cookie>()
    private var appContext: Context? = null

    fun initialize(context: Context) {
        if (appContext != null) return
        appContext = context.applicationContext
        val stored = context.getSharedPreferences("calendar_session", Context.MODE_PRIVATE)
            .getStringSet("cookies", emptySet())
            .orEmpty()
        val baseUrl = BuildConfig.API_BASE_URL.toHttpUrl()
        cookies += stored.mapNotNull { Cookie.parse(baseUrl, it) }
            .filter { it.expiresAt > System.currentTimeMillis() }
    }

    override fun saveFromResponse(url: HttpUrl, newCookies: List<Cookie>) {
        newCookies.forEach { newCookie ->
            cookies.removeAll { it.name == newCookie.name && it.domain == newCookie.domain && it.path == newCookie.path }
            if (newCookie.expiresAt > System.currentTimeMillis()) cookies += newCookie
        }
        persist()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> = cookies.filter { it.matches(url) && it.expiresAt > System.currentTimeMillis() }

    fun clear() {
        cookies.clear()
        persist()
    }

    private fun persist() {
        appContext?.getSharedPreferences("calendar_session", Context.MODE_PRIVATE)
            ?.edit()
            ?.putStringSet("cookies", cookies.map { it.toString() }.toSet())
            ?.apply()
    }
}

object ApiProvider {
    val cookieJar = SessionCookieJar()

    fun initialize(context: Context) = cookieJar.initialize(context)

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = false
    }

    val api: CalendarApi by lazy {
        val logger = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        val client = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .addInterceptor(logger)
            .build()

        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(CalendarApi::class.java)
    }
}
