import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  TextInput, 
  Dimensions, 
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const isSmallScreen = width < 768;

interface Delivery {
  id: string;
  customerName: string;
  phone: string;
  gasType: string;
  total: number;
  driverName: string;
  deliveredAt: any;
}

interface StatsViewProps {
  deliveries: Delivery[];
}

export default function StatsView({ deliveries }: StatsViewProps) {
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'customer' | 'driver' | 'total' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter deliveries based on search
  const filtered = deliveries.filter(delivery =>
    (delivery.customerName?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (delivery.driverName?.toLowerCase() || '').includes(search.toLowerCase())
  );

  // Sort filtered deliveries
  const sortedDeliveries = [...filtered].sort((a, b) => {
    if (sortBy === 'customer') {
      return sortOrder === 'asc' 
        ? (a.customerName || '').localeCompare(b.customerName || '')
        : (b.customerName || '').localeCompare(a.customerName || '');
    } else if (sortBy === 'driver') {
      return sortOrder === 'asc'
        ? (a.driverName || '').localeCompare(b.driverName || '')
        : (b.driverName || '').localeCompare(a.driverName || '');
    } else if (sortBy === 'total') {
      return sortOrder === 'asc'
        ? (a.total || 0) - (b.total || 0)
        : (b.total || 0) - (a.total || 0);
    } else { // date
      const dateA = a.deliveredAt ? new Date(a.deliveredAt.seconds * 1000) : new Date(0);
      const dateB = b.deliveredAt ? new Date(b.deliveredAt.seconds * 1000) : new Date(0);
      return sortOrder === 'asc'
        ? dateA.getTime() - dateB.getTime()
        : dateB.getTime() - dateA.getTime();
    }
  });

  // Calculate statistics
  const totalRevenue = filtered.reduce((sum, d) => sum + Number(d.total || 0), 0);
  const averageOrder = filtered.length > 0 ? totalRevenue / filtered.length : 0;
  
  // Group by gas type
  const gasSummary = filtered.reduce((acc, delivery) => {
    const gasType = delivery.gasType || 'Unknown';
    if (!acc[gasType]) {
      acc[gasType] = { count: 0, total: 0 };
    }
    acc[gasType].count += 1;
    acc[gasType].total += delivery.total || 0;
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  // Group by driver
  const driverSummary = filtered.reduce((acc, delivery) => {
    const driverName = delivery.driverName || 'Unknown';
    if (!acc[driverName]) {
      acc[driverName] = { count: 0, total: 0 };
    }
    acc[driverName].count += 1;
    acc[driverName].total += delivery.total || 0;
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Simulate a fetch - in a real app, you would fetch new data here
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const toggleSort = (field: 'customer' | 'driver' | 'total' | 'date') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderSortIcon = (field: 'customer' | 'driver' | 'total' | 'date') => {
    if (sortBy !== field) return null;
    return (
      <Ionicons 
        name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} 
        size={16} 
        color="#3f51b5" 
        style={{ marginLeft: 4 }}
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Delivery Statistics</Text>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by customer or driver name"
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#999"
            clearButtonMode="while-editing"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.summaryCards}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Deliveries</Text>
          <Text style={styles.summaryValue}>{filtered.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Revenue</Text>
          <Text style={styles.summaryValue}>${Number(totalRevenue || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Average Order</Text>
          <Text style={styles.summaryValue}>
  ${Number(averageOrder || 0).toFixed(2)}
</Text>
        </View>
      </View>

      <View style={styles.tableHeader}>
        <TouchableOpacity 
          style={[styles.headerCell, { flex: 2 }]} 
          onPress={() => toggleSort('customer')}
        >
          <Text style={styles.headerText}>Customer</Text>
          {renderSortIcon('customer')}
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.headerCell, { flex: 1.5 }]} 
          onPress={() => toggleSort('driver')}
        >
          <Text style={styles.headerText}>Driver</Text>
          {renderSortIcon('driver')}
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.headerCell, { flex: 1 }]} 
          onPress={() => toggleSort('total')}
        >
          <Text style={styles.headerText}>Total</Text>
          {renderSortIcon('total')}
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.headerCell, { flex: isSmallScreen ? 0 : 1.5 }]} 
          onPress={() => toggleSort('date')}
        >
          {!isSmallScreen && (
            <>
              <Text style={styles.headerText}>Date</Text>
              {renderSortIcon('date')}
            </>
          )}
        </TouchableOpacity>
      </View>

      {sortedDeliveries.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={60} color="#ddd" />
          <Text style={styles.emptyText}>
            {search ? "No deliveries match your search" : "No deliveries found"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedDeliveries}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3f51b5']} />
          }
          renderItem={({ item, index }) => (
            <View style={[
              styles.tableRow, 
              index % 2 === 0 ? styles.evenRow : styles.oddRow
            ]}>
              <View style={[styles.tableCell, { flex: 2 }]}>
                <Text style={styles.customerName}>{item.customerName || 'Unknown'}</Text>
                <Text style={styles.phoneNumber}>{item.phone || 'No phone'}</Text>
              </View>
              <View style={[styles.tableCell, { flex: 1.5 }]}>
                <Text style={styles.driverName}>{item.driverName || 'Unknown'}</Text>
                <Text style={styles.gasType}>{item.gasType || 'Unknown'}</Text>
              </View>
              <View style={[styles.tableCell, { flex: 1 }]}>
                <Text style={styles.price}>$ ${Number(item.total || 0).toFixed(2)}</Text>
              </View>
              {!isSmallScreen && (
                <View style={[styles.tableCell, { flex: 1.5 }]}>
                  <Text style={styles.date}>{formatDate(item.deliveredAt)}</Text>
                </View>
              )}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 140 }}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Summary</Text>
        <View style={styles.footerRow}>
          <Text style={styles.footerLabel}>Total Deliveries:</Text>
          <Text style={styles.footerValue}>{filtered.length}</Text>
        </View>
        <View style={styles.footerRow}>
          <Text style={styles.footerLabel}>Total Revenue:</Text>
          <Text style={styles.footerValue}> ${Number(totalRevenue || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.footerRow}>
          <Text style={styles.footerLabel}>Average Order Value:</Text>
          <Text style={styles.footerValue}>$ ${Number(averageOrder || 0).toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    borderRadius: 8,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 15,
    color: '#333',
  },
  summaryCards: {
    flexDirection: isSmallScreen ? 'column' : 'row',
    justifyContent: 'space-between',
    padding: 16,
    flexWrap: 'wrap',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    marginBottom: isSmallScreen ? 12 : 0,
    width: isSmallScreen ? '100%' : '31%',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3f51b5',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#ddd',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontWeight: 'bold',
    color: '#666',
    fontSize: 14,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  evenRow: {
    backgroundColor: '#fff',
  },
  oddRow: {
    backgroundColor: '#f9f9f9',
  },
  tableCell: {
    justifyContent: 'center',
  },
  customerName: {
    fontWeight: '600',
    fontSize: 15,
    color: '#333',
  },
  phoneNumber: {
    color: '#666',
    fontSize: 13,
    marginTop: 4,
  },
  driverName: {
    fontSize: 14,
    color: '#444',
  },
  gasType: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  price: {
    fontWeight: '600',
    fontSize: 15,
    color: '#3f51b5',
  },
  date: {
    fontSize: 13,
    color: '#666',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#ddd',
    padding: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  footerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  footerLabel: {
    fontSize: 14,
    color: '#666',
  },
  footerValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
  },
});