package com.ai0506.calendar

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ai0506.calendar.ui.CalendarApp
import com.ai0506.calendar.ui.CalendarTheme
import com.ai0506.calendar.data.ApiProvider

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ApiProvider.initialize(applicationContext)
        enableEdgeToEdge()
        setContent {
            CalendarTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    val viewModel: CalendarViewModel = viewModel()
                    val state by viewModel.state.collectAsStateWithLifecycle()
                    CalendarApp(state = state, viewModel = viewModel)
                }
            }
        }
    }
}
