package syncmap

import "sync"

// Map type-safe sync map wrapper
type Map[K comparable, V any] struct {
	m sync.Map
}

func (m *Map[K, V]) Delete(key K) { m.m.Delete(key) }

func (m *Map[K, V]) Load(key K) (value V, ok bool) {
	v, ok := m.m.Load(key)
	if !ok {
		return value, ok
	}
	return v.(V), ok
}

func (m *Map[K, V]) LoadAndDelete(key K) (value V, loaded bool) {
	v, loaded := m.m.LoadAndDelete(key)
	if !loaded {
		return value, loaded
	}
	return v.(V), loaded
}

func (m *Map[K, V]) LoadOrStore(key K, value V) (actual V, ok bool) {
	a, ok := m.m.LoadOrStore(key, value)
	return a.(V), ok
}

func (m *Map[K, V]) Range(f func(key K, value V) bool) {
	m.m.Range(func(key, value any) bool { return f(key.(K), value.(V)) })
}

func (m *Map[K, V]) Store(key K, value V) { m.m.Store(key, value) }

func (m *Map[K, V]) GetValues() []V {
	var values []V
	m.m.Range(func(key, value any) bool {
		values = append(values, value.(V))
		return true
	})
	return values
}

func (m *Map[K, V]) Keys() []K {
	var values []K
	m.m.Range(func(key, value any) bool {
		values = append(values, key.(K))
		return true
	})
	return values
}
